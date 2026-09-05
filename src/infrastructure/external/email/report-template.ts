import type {
    ReportedContentSummary,
    ReportReasonCount,
} from "@core/domain/interfaces/report.interface";
import { escapeHtml } from "./escape-html";

/**
 * Inline styles, repeated rather than left to the stylesheet for the reason
 * the digest template gives: several mail clients strip a `<style>` block, and
 * a stripped queue would collapse into an unreadable run of text.
 */
const ITEM_STYLE =
    "margin:0 0 18px 0;padding:0 0 18px 0;border-bottom:1px solid #eeeeee;";

const LINK_STYLE = "color:#000000;text-decoration:underline;";

const META_STYLE = "font-size:12px;color:#777777;margin:4px 0 0 0;";

const QUOTE_STYLE =
    "font-size:13px;color:#333333;margin:8px 0 0 0;padding:8px 12px;background:#f6f6f6;border-left:3px solid #dddddd;white-space:pre-wrap;";

const COUNT_STYLE = "font-size:14px;font-weight:700;color:#000000;margin:0;";

/**
 * Renders one reason tally as "SPAM ×3, HARASSMENT ×1".
 *
 * @param reasons - The tally, most cited first.
 * @returns Escaped, comma-separated text.
 */
function renderReasons(reasons: ReportReasonCount[]): string {
    return reasons
        .map((entry) => `${escapeHtml(entry.reason)} &times;${entry.count}`)
        .join(", ");
}

/**
 * Renders one reported post or comment as a block.
 *
 * Everything a reporter or an author wrote is escaped. This email is the one
 * place where two different people's untrusted text lands in the same
 * document - the content that was reported, and what the reporter said about
 * it - and it goes to the person with the database credentials.
 *
 * The target id is printed in full and unlinked as well as linked, because the
 * operator's next step is a SQL statement that needs it and the content the
 * link points at may already be gone.
 *
 * @param item - One target and the reports collected against it.
 * @returns The item's HTML.
 */
export function renderReportItem(item: ReportedContentSummary): string {
    const parts: string[] = [];

    parts.push(
        `<p style="${COUNT_STYLE}">${item.reporterCount} report${item.reporterCount === 1 ? "" : "s"} &middot; ${escapeHtml(item.targetKind)} &middot; @${escapeHtml(item.authorUsername)}</p>`,
    );

    parts.push(`<p style="${META_STYLE}">${renderReasons(item.reasons)}</p>`);

    if (item.excerpt.length > 0) {
        parts.push(`<p style="${QUOTE_STYLE}">${escapeHtml(item.excerpt)}</p>`);
    }

    if (item.mediaCount > 0) {
        parts.push(
            `<p style="${META_STYLE}">${item.mediaCount} attached file${item.mediaCount === 1 ? "" : "s"}, not shown here</p>`,
        );
    }

    for (const note of item.details) {
        parts.push(
            `<p style="${QUOTE_STYLE}">Reporter: ${escapeHtml(note)}</p>`,
        );
    }

    parts.push(
        `<p style="${META_STYLE}"><a style="${LINK_STYLE}" href="${escapeHtml(item.url)}">Open</a> &middot; <code>${escapeHtml(item.targetId)}</code></p>`,
    );

    return `<div style="${ITEM_STYLE}">${parts.join("")}</div>`;
}

/**
 * Renders the body of the morning summary.
 *
 * @param items - Open reports, collected per target, most reported first.
 * @param totalPending - Every report still open, including any this email cut.
 * @returns The inner HTML for the email's content area.
 */
export function renderReportDigest(
    items: ReportedContentSummary[],
    totalPending: number,
): string {
    const shown = items.length;
    const covered = items.reduce((sum, item) => sum + item.reporterCount, 0);

    const header =
        totalPending > covered
            ? `<p style="${META_STYLE}">${shown} item${shown === 1 ? "" : "s"} shown, covering ${covered} of ${totalPending} open reports.</p>`
            : `<p style="${META_STYLE}">${shown} item${shown === 1 ? "" : "s"}, ${totalPending} open report${totalPending === 1 ? "" : "s"}.</p>`;

    return header + items.map((item) => renderReportItem(item)).join("");
}
