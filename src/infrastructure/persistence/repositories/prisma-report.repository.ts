import type { Report } from "@core/domain/entities/report.entity";
import type { ReportTargetKind } from "@core/domain/enums";
import { ReportStatus } from "@core/domain/enums";
import type { IReportRepository } from "@core/ports/repositories/report.repository";
import { ReportPrismaMapper } from "@infrastructure/persistence/mappers/report-prisma.mapper";
import type { PrismaTransactionalClient } from "@infrastructure/persistence/database/prisma-client.type";
import { Prisma } from "@generated/prisma/client";
import type { ReportStatus as PrismaReportStatus } from "@generated/prisma/client";

/**
 * Prisma implementation of the report repository.
 *
 * Every read here is the operator's, not a user's: the queue, the escalation
 * count and the retention sweep. The only write a request can reach is
 * {@link create}.
 */
export class PrismaReportRepository implements IReportRepository {
    /**
     * @param prisma - Prisma client, possibly scoped to a transaction
     */
    constructor(private readonly prisma: PrismaTransactionalClient) {}

    /**
     * Files a report, unless this reporter already reported this target.
     *
     * The insert decides. Checking first would leave the window two taps on
     * the same button routinely land in, and the loser should see the report
     * that exists rather than a uniqueness error.
     *
     * @param report - The report to file.
     * @returns The stored report, or null when one was already there.
     */
    async create(report: Report): Promise<Report | null> {
        try {
            const row = await this.prisma.report.create({
                data: ReportPrismaMapper.toPrismaCreate(report),
            });

            return ReportPrismaMapper.toDomain(row);
        } catch (error: unknown) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2002"
            ) {
                // This person has already reported this content.
                return null;
            }

            throw error;
        }
    }

    /**
     * Counts how many distinct people have reported one piece of content.
     *
     * @param targetKind - Whether the target is a post or a comment.
     * @param targetId - The reported content's id.
     * @returns The number of reports standing against that content.
     */
    async countDistinctReporters(
        targetKind: ReportTargetKind,
        targetId: string,
    ): Promise<number> {
        // One row per reporter is what the unique index allows, so the row
        // count is the people count - no distinct needed.
        return this.prisma.report.count({
            where: { targetKind, targetId },
        });
    }

    /**
     * Reads the reports nobody has dealt with yet, oldest first.
     *
     * @param limit - Most rows to return.
     * @returns The open reports.
     */
    async findPending(limit: number): Promise<Report[]> {
        const rows = await this.prisma.report.findMany({
            where: { status: ReportStatus.PENDING as PrismaReportStatus },
            orderBy: { createdAt: "asc" },
            take: limit,
        });

        return rows.map((row) => ReportPrismaMapper.toDomain(row));
    }

    /**
     * Counts every report still waiting for an operator, of any age.
     *
     * @returns The number of PENDING reports.
     */
    async countPending(): Promise<number> {
        return this.prisma.report.count({
            where: { status: ReportStatus.PENDING as PrismaReportStatus },
        });
    }

    /**
     * Deletes reports filed before a cutoff, whatever their status.
     *
     * @param cutoff - Reports created before this are removed.
     * @returns How many rows were deleted.
     */
    async deleteOlderThan(cutoff: Date): Promise<number> {
        const { count } = await this.prisma.report.deleteMany({
            where: { createdAt: { lt: cutoff } },
        });

        return count;
    }
}
