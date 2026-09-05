import type { IReportDigestDeliveryRepository } from "@core/ports/repositories/report-digest-delivery.repository";
import type { PrismaTransactionalClient } from "@infrastructure/persistence/database/prisma-client.type";
import { Prisma } from "@generated/prisma/client";

/**
 * Prisma implementation of the report summary delivery repository.
 *
 * One row per day, and the row is what stops several instances mailing the
 * operator the same queue several times.
 */
export class PrismaReportDigestDeliveryRepository implements IReportDigestDeliveryRepository {
    /**
     * @param prisma - Prisma client, possibly scoped to a transaction
     */
    constructor(private readonly prisma: PrismaTransactionalClient) {}

    /**
     * Claims a day's report summary, if nobody else has.
     *
     * The insert *is* the claim, for the reason the per-user digest gives:
     * reading first and then writing leaves a window both instances pass
     * through, and only one insert can win the unique index.
     *
     * @param digestOn - The calendar day the summary belongs to.
     * @param reportCount - How many reports the email will cover.
     * @returns True when this caller won the claim and should send.
     */
    async claim(digestOn: Date, reportCount: number): Promise<boolean> {
        try {
            await this.prisma.reportDigestDelivery.create({
                data: { digestOn, reportCount },
            });

            return true;
        } catch (error: unknown) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2002"
            ) {
                // Another instance is already sending this morning's summary.
                return false;
            }

            throw error;
        }
    }
}
