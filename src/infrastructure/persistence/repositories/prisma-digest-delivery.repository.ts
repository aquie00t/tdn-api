import type { IDigestDeliveryRepository } from "@core/ports/repositories/digest-delivery.repository";
import type { PrismaTransactionalClient } from "@infrastructure/persistence/database/prisma-client.type";
import { Prisma } from "@generated/prisma/client";

/**
 * Prisma implementation of the digest delivery repository.
 *
 * Holds the record of which users have already had a digest on a given day,
 * which is the only thing standing between several API instances running the
 * same morning schedule and everybody receiving the same email several times.
 */
export class PrismaDigestDeliveryRepository implements IDigestDeliveryRepository {
    /**
     * @param prisma - Prisma client, possibly scoped to a transaction
     */
    constructor(private readonly prisma: PrismaTransactionalClient) {}

    /**
     * Claims today's digest for a user, if nobody else has.
     *
     * The insert *is* the claim. Reading first and then writing would leave a
     * window in which two instances both see nothing and both send; letting
     * the unique index decide closes it, because only one insert can win.
     *
     * @param userId - The recipient being claimed.
     * @param digestOn - The calendar day the digest belongs to.
     * @returns True when this caller won the claim and should send.
     */
    async claim(userId: string, digestOn: Date): Promise<boolean> {
        try {
            await this.prisma.digestDelivery.create({
                data: { userId, digestOn },
            });

            return true;
        } catch (error: unknown) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2002"
            ) {
                // Somebody else is already sending this one.
                return false;
            }

            throw error;
        }
    }

    /**
     * Reads when a user last received a digest.
     *
     * @param userId - The recipient to look up.
     * @returns The timestamp of the most recent delivery, or null for a user
     * who has never received one.
     */
    async findLastSentAt(userId: string): Promise<Date | null> {
        const last = await this.prisma.digestDelivery.findFirst({
            where: { userId },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
        });

        return last?.createdAt ?? null;
    }
}
