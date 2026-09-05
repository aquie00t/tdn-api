/**
 * Which kind of content a report points at.
 *
 * Posts and comments only. An account is dealt with by blocking it, and a
 * direct message is not public content - reporting one would mean handing its
 * plaintext to an operator, which the encryption at rest exists to prevent.
 *
 * Mirrors the `ReportTargetKind` enum in the Prisma schema exactly.
 */
export enum ReportTargetKind {
    POST = "POST",
    COMMENT = "COMMENT",
}
