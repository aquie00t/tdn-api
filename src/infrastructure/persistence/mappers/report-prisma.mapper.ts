import type { Prisma, Report as PrismaReport } from "@generated/prisma/client";
import { Report } from "@core/domain/entities/report.entity";
import type {
    ReportReason,
    ReportStatus,
    ReportTargetKind,
} from "@core/domain/enums";

/**
 * Two-way mapper between the `reports` table and the domain entity.
 *
 * There is no `toResponse`. A report is never read back over the API: the
 * reporter is told it was received and nothing else, and the operator reads
 * the queue from the database. Serving it would turn the moderation backlog
 * into a public list of what an account has been accused of.
 */
export class ReportPrismaMapper {
    /**
     * Maps a database row to the domain entity.
     *
     * The enum casts are safe because the domain enums mirror the Prisma ones
     * value for value, which is why they were written that way.
     *
     * @param row - The Prisma report row
     * @returns The instantiated Report domain entity
     */
    public static toDomain(row: PrismaReport): Report {
        return Report.with({
            id: row.id,
            reporterId: row.reporterId,
            targetKind: row.targetKind as unknown as ReportTargetKind,
            targetId: row.targetId,
            targetParentId: row.targetParentId,
            targetAuthorId: row.targetAuthorId,
            reason: row.reason as unknown as ReportReason,
            details: row.details,
            contentSnapshot: row.contentSnapshot,
            mediaKeys: row.mediaKeys,
            status: row.status as unknown as ReportStatus,
            reviewedAt: row.reviewedAt,
            createdAt: row.createdAt,
        });
    }

    /**
     * Maps a domain entity to the shape Prisma needs to insert it.
     *
     * `status` is left to the column default rather than written: the API only
     * ever files PENDING reports, and saying so twice invites the two places
     * to disagree.
     *
     * @param report - The report to persist
     * @returns The Prisma create input
     */
    public static toPrismaCreate(report: Report): Prisma.ReportCreateInput {
        return {
            reporter: { connect: { id: report.reporterId } },
            targetKind: report.targetKind,
            targetId: report.targetId,
            targetParentId: report.targetParentId,
            targetAuthor: { connect: { id: report.targetAuthorId } },
            reason: report.reason,
            details: report.details,
            contentSnapshot: report.contentSnapshot,
            mediaKeys: report.mediaKeys,
        };
    }
}
