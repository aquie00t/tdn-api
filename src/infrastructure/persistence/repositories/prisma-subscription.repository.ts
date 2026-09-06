import type { Subscription } from "@core/domain/entities/subscription.entity";
import { SubscriptionStatus } from "@core/domain/enums";
import type {
    ISubscriptionRepository,
    ReconcilableSubscription,
} from "@core/ports/repositories/subscription.repository";
import { SubscriptionPrismaMapper } from "@infrastructure/persistence/mappers/subscription-prisma.mapper";
import type { PrismaTransactionalClient } from "@infrastructure/persistence/database/prisma-client.type";
import type {
    BillingProvider as PrismaBillingProvider,
    SubscriptionStatus as PrismaSubscriptionStatus,
} from "@generated/prisma/client";

/**
 * Statuses worth a nightly look.
 *
 * A revoked or long-cancelled row has nothing left to repair; including them
 * would make the pass grow with every account that ever subscribed rather than
 * with the ones that currently pay.
 */
const LIVE_STATUSES = [
    SubscriptionStatus.PENDING,
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.IN_GRACE,
] as unknown as PrismaSubscriptionStatus[];

/**
 * Prisma implementation of the subscription repository.
 */
export class PrismaSubscriptionRepository implements ISubscriptionRepository {
    /**
     * @param prisma - Prisma client, possibly scoped to a transaction
     */
    constructor(private readonly prisma: PrismaTransactionalClient) {}

    /**
     * Reads an account's billing row.
     *
     * @param userId - The account to look up.
     * @returns Its subscription, or null.
     */
    async findByUserId(userId: string): Promise<Subscription | null> {
        const row = await this.prisma.subscription.findUnique({
            where: { userId },
        });

        return row ? SubscriptionPrismaMapper.toDomain(row) : null;
    }

    /**
     * Reads a billing row by the provider's identifier for it.
     *
     * @param providerSubscriptionId - The provider's identifier.
     * @returns The subscription, or null.
     */
    async findByProviderSubscriptionId(
        providerSubscriptionId: string,
    ): Promise<Subscription | null> {
        const row = await this.prisma.subscription.findUnique({
            where: { providerSubscriptionId },
        });

        return row ? SubscriptionPrismaMapper.toDomain(row) : null;
    }

    /**
     * Writes an account's billing row, creating it if there is none.
     *
     * @param subscription - The state to store.
     * @returns The stored subscription.
     */
    async save(subscription: Subscription): Promise<Subscription> {
        const data = SubscriptionPrismaMapper.toPrismaData(subscription);

        const row = await this.prisma.subscription.upsert({
            where: { userId: subscription.userId },
            update: {
                ...data,
                provider: data.provider as PrismaBillingProvider,
                status: data.status as PrismaSubscriptionStatus,
            },
            create: {
                userId: subscription.userId,
                ...data,
                provider: data.provider as PrismaBillingProvider,
                status: data.status as PrismaSubscriptionStatus,
            },
        });

        return SubscriptionPrismaMapper.toDomain(row);
    }

    /**
     * Sets the account's badge expiry.
     *
     * @param userId - The account whose badge is being set.
     * @param verifiedUntil - When it expires, or null to remove it.
     */
    async setVerifiedUntil(
        userId: string,
        verifiedUntil: Date | null,
    ): Promise<void> {
        await this.prisma.user.update({
            where: { id: userId },
            data: { verifiedUntil },
        });
    }

    /**
     * Reads the subscriptions the nightly reconcile has to look at.
     *
     * The owner's ban and deletion flags come back with the row because they
     * are the reason half of this pass exists, and fetching them per row would
     * turn one query into a hundred.
     *
     * @param limit - Most rows to return in one pass.
     * @returns The subscriptions to reconcile.
     */
    async findReconcilable(limit: number): Promise<ReconcilableSubscription[]> {
        const rows = await this.prisma.subscription.findMany({
            where: { status: { in: LIVE_STATUSES } },
            orderBy: { updatedAt: "asc" },
            take: limit,
            include: {
                user: { select: { bannedAt: true, deletedAt: true } },
            },
        });

        return rows.map((row) => ({
            subscription: SubscriptionPrismaMapper.toDomain(row),
            isBanned: row.user.bannedAt !== null,
            isDeleted: row.user.deletedAt !== null,
        }));
    }
}
