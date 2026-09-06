import type { Subscription as PrismaSubscription } from "@generated/prisma/client";
import { Subscription } from "@core/domain/entities/subscription.entity";
import type { BillingProvider, SubscriptionStatus } from "@core/domain/enums";

/**
 * Two-way mapper between the `subscriptions` table and the domain entity.
 *
 * There is no `toResponse`. What the API serves is `GetSubscriptionOutput`,
 * which is a smaller thing on purpose: provider identifiers are for talking to
 * the store, not for handing to a client.
 */
export class SubscriptionPrismaMapper {
    /**
     * Maps a database row to the domain entity.
     *
     * @param row - The Prisma subscription row
     * @returns The instantiated Subscription domain entity
     */
    public static toDomain(row: PrismaSubscription): Subscription {
        return Subscription.with({
            id: row.id,
            userId: row.userId,
            provider: row.provider as unknown as BillingProvider,
            providerCustomerId: row.providerCustomerId,
            providerSubscriptionId: row.providerSubscriptionId,
            status: row.status as unknown as SubscriptionStatus,
            currentPeriodEnd: row.currentPeriodEnd,
            cancelAtPeriodEnd: row.cancelAtPeriodEnd,
            lastEventAt: row.lastEventAt,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        });
    }

    /**
     * The fields a save writes, whether the row exists or not.
     *
     * Shared between both halves of the upsert so a resubscription cannot
     * leave a stale status or period end from the previous one.
     *
     * @param subscription - The state being stored
     * @returns The fields to write
     */
    public static toPrismaData(subscription: Subscription): {
        provider: string;
        providerCustomerId: string | null;
        providerSubscriptionId: string | null;
        status: string;
        currentPeriodEnd: Date | null;
        cancelAtPeriodEnd: boolean;
        lastEventAt: Date | null;
    } {
        return {
            provider: subscription.provider,
            providerCustomerId: subscription.providerCustomerId,
            providerSubscriptionId: subscription.providerSubscriptionId,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            lastEventAt: subscription.lastEventAt,
        };
    }
}
