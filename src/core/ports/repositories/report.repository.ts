import type { Report } from "@core/domain/entities/report.entity";
import type { ReportTargetKind } from "@core/domain/enums";

/**
 * Persistence contract for content reports.
 *
 * Nothing here reads the reported content: a report carries its own copy of
 * what it is about, so the queue survives the post being deleted.
 */
export interface IReportRepository {
    /**
     * Files a report, unless this reporter already reported this target.
     *
     * The unique index decides, rather than a read followed by a write: two
     * taps on the same button are a routine race, and the loser of it should
     * see the report that exists, not an error.
     *
     * @param report - The report to file.
     * @returns The stored report, or null when one was already there.
     */
    create(report: Report): Promise<Report | null>;

    /**
     * Counts how many distinct people have reported one piece of content.
     *
     * Distinct by construction: the unique index allows one row per reporter
     * per target, so counting rows counts people. This is what the escalation
     * threshold is measured against - one determined account cannot push
     * anything over it alone.
     *
     * @param targetKind - Whether the target is a post or a comment.
     * @param targetId - The reported content's id.
     * @returns The number of reports standing against that content.
     */
    countDistinctReporters(
        targetKind: ReportTargetKind,
        targetId: string,
    ): Promise<number>;

    /**
     * Reads the reports nobody has dealt with yet, oldest first.
     *
     * The daily summary is the current queue rather than the last day's
     * arrivals, deliberately. A window anchored to the previous send loses
     * whatever it covered if that email never arrives, and a moderation
     * backlog is the last place to build in silent gaps; showing what is still
     * open means a failed morning costs nothing and an ignored report keeps
     * asking. Items leave the email by being dealt with, not by ageing out.
     *
     * Grouping is left to the caller: collecting reports per target is pure
     * logic and belongs where it can be tested without a database.
     *
     * @param limit - Most rows to return, so a loud night cannot produce an
     * unbounded email.
     * @returns The open reports, oldest first.
     */
    findPending(limit: number): Promise<Report[]>;

    /**
     * Counts every report still waiting for an operator.
     *
     * Reported beside the summary's contents, so a queue longer than one email
     * can show says so.
     *
     * @returns The number of PENDING reports.
     */
    countPending(): Promise<number>;

    /**
     * Deletes reports filed before a cutoff, whatever their status.
     *
     * @param cutoff - Reports created before this are removed.
     * @returns How many rows were deleted.
     */
    deleteOlderThan(cutoff: Date): Promise<number>;
}
