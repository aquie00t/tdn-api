import type { ReportReason, ReportTargetKind } from "@core/domain/enums";

/**
 * How often one reason was given for one piece of content.
 */
export interface ReportReasonCount {
    reason: ReportReason;

    count: number;
}

/**
 * Everything an operator needs about one reported post or comment, with the
 * reports against it already collected.
 *
 * Resolved for rendering: the author's handle rather than an id, and the
 * content as it was reported rather than as it stands now - the row carries
 * the snapshot precisely because the live version may be gone.
 */
export interface ReportedContentSummary {
    targetKind: ReportTargetKind;

    targetId: string;

    /** Handle of whoever wrote the reported content. */
    authorUsername: string;

    /** How many distinct people reported it. */
    reporterCount: number;

    /** Which reasons were given, most cited first. */
    reasons: ReportReasonCount[];

    /** The reported text, trimmed for an email. */
    excerpt: string;

    /** How many files were attached, since the email cannot show them. */
    mediaCount: number;

    /** What reporters wrote in their own words, in the order filed. */
    details: string[];

    /** Absolute link to the content, for the cases where it still exists. */
    url: string;

    firstReportedAt: Date;

    lastReportedAt: Date;
}

/**
 * The email sent the moment one piece of content crosses the escalation
 * threshold.
 */
export interface ReportAlertEmail {
    /** The operator address. */
    to: string;

    /** The content that crossed it, and everything said about it. */
    item: ReportedContentSummary;

    /** The threshold it crossed, so the subject can say why this arrived. */
    threshold: number;
}

/**
 * The morning summary of everything still open.
 */
export interface ReportDigestEmail {
    /** The operator address. */
    to: string;

    /** Open reports, collected per target, most reported first. */
    items: ReportedContentSummary[];

    /** Every report still PENDING, including those this email had to cut. */
    totalPending: number;
}
