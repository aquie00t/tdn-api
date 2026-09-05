/**
 * Where a report stands.
 *
 * Moved by hand, like a ban: there is no endpoint and no admin panel, and
 * `docs/reporting.md` carries the statements. Only PENDING is ever written by
 * the API.
 *
 * Mirrors the `ReportStatus` enum in the Prisma schema exactly.
 */
export enum ReportStatus {
    PENDING = "PENDING",
    REVIEWED = "REVIEWED",
    ACTIONED = "ACTIONED",
    DISMISSED = "DISMISSED",
}
