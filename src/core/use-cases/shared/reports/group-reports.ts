import type { Report } from "@core/domain/entities/report.entity";
import { ReportTargetKind } from "@core/domain/enums";
import type {
    ReportedContentSummary,
    ReportReasonCount,
} from "@core/domain/interfaces/report.interface";

/**
 * What the grouping needs from its caller: how to name an author, and how to
 * build a link.
 */
export interface GroupReportsContext {
    /** Author id to current handle. A missing id renders as "unknown". */
    usernames: Map<string, string>;

    /** Origin the web app is served from, without a trailing slash. */
    frontendUrl: string;

    /** Longest excerpt of the reported text to carry into an email. */
    excerptLength: number;

    /** Most reporter notes to carry per target. */
    maxDetails: number;
}

/**
 * Builds the link the operator follows, when one can be built.
 *
 * A reported post always resolves. A reported comment resolves only when it
 * was written under a post - the report row deliberately does not claim to
 * know an article's slug - and otherwise the email falls back to the ids it
 * prints beside the link.
 *
 * @param report - Any one report of the target.
 * @param frontendUrl - Origin the web app is served from.
 * @returns The absolute URL, or the origin when the target cannot be linked.
 */
function linkFor(report: Report, frontendUrl: string): string {
    const origin = frontendUrl.replace(/\/+$/, "");

    if (report.targetKind === ReportTargetKind.POST) {
        return `${origin}/posts/${report.targetId}`;
    }

    if (report.targetParentId) {
        return `${origin}/posts/${report.targetParentId}#comment-${report.targetId}`;
    }

    return origin;
}

/**
 * Tallies the reasons given for one target, most cited first.
 *
 * @param reports - Every report of that target.
 * @returns The tally.
 */
function tallyReasons(reports: Report[]): ReportReasonCount[] {
    const counts = new Map<string, number>();

    for (const report of reports) {
        counts.set(report.reason, (counts.get(report.reason) ?? 0) + 1);
    }

    return [...counts.entries()]
        .map(([reason, count]) => ({
            reason: reason as ReportReasonCount["reason"],
            count,
        }))
        .sort((a, b) => b.count - a.count);
}

/**
 * Trims text to a length without cutting a word in half.
 *
 * @param text - The text to trim.
 * @param limit - Longest result, before the ellipsis.
 * @returns The trimmed text.
 */
function excerptOf(text: string, limit: number): string {
    const collapsed = text.replace(/\s+/g, " ").trim();
    if (collapsed.length <= limit) return collapsed;

    const cut = collapsed.slice(0, limit);
    const lastSpace = cut.lastIndexOf(" ");

    return `${lastSpace > limit / 2 ? cut.slice(0, lastSpace) : cut}…`;
}

/**
 * Collects reports into one entry per reported piece of content.
 *
 * Pure, and deliberately so: this is the whole of the summary's presentation
 * logic, and it should be testable without a database, a clock or a mail
 * provider.
 *
 * Ordering puts the most-reported content first and breaks ties on the most
 * recent report, because an operator reads from the top and the queue can be
 * longer than the attention it gets. Within an entry, the text and the media
 * count come from the *earliest* report: it is the closest thing to what the
 * content looked like before anybody could react to being reported.
 *
 * @param reports - Open reports, in any order.
 * @param context - Handles, origin and the two length caps.
 * @returns One summary per target, most reported first.
 */
export function groupReports(
    reports: Report[],
    context: GroupReportsContext,
): ReportedContentSummary[] {
    const groups = new Map<string, Report[]>();

    for (const report of reports) {
        const key = `${report.targetKind}:${report.targetId}`;
        const bucket = groups.get(key);

        if (bucket) bucket.push(report);
        else groups.set(key, [report]);
    }

    const summaries: ReportedContentSummary[] = [];

    for (const bucket of groups.values()) {
        const ordered = [...bucket].sort((a, b) => timeOf(a) - timeOf(b));
        const first = ordered[0]!;
        const last = ordered[ordered.length - 1]!;

        summaries.push({
            targetKind: first.targetKind,
            targetId: first.targetId,
            authorUsername:
                context.usernames.get(first.targetAuthorId) ?? "unknown",
            reporterCount: ordered.length,
            reasons: tallyReasons(ordered),
            excerpt: excerptOf(first.contentSnapshot, context.excerptLength),
            mediaCount: first.mediaKeys.length,
            details: ordered
                .map((report) => report.details)
                .filter((note): note is string => Boolean(note))
                .slice(0, context.maxDetails),
            url: linkFor(first, context.frontendUrl),
            firstReportedAt: new Date(timeOf(first)),
            lastReportedAt: new Date(timeOf(last)),
        });
    }

    return summaries.sort(
        (a, b) =>
            b.reporterCount - a.reporterCount ||
            b.lastReportedAt.getTime() - a.lastReportedAt.getTime(),
    );
}

/**
 * When a report was filed, falling back to now for one that has not been
 * persisted yet - which only the alert path can produce.
 *
 * @param report - The report to read.
 * @returns Milliseconds since the epoch.
 */
function timeOf(report: Report): number {
    return (report.createdAt ?? new Date()).getTime();
}
