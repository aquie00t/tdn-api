import type { Subscription } from "@core/domain/entities/subscription.entity";

/**
 * Repository interface for billing relationships and the badge they grant.
 */
export interface ISubscriptionRepository {
    /**
     * Reads an account's billing row.
     *
     * @param userId - The account to look up.
     * @returns Its subscription, or null for an account that has never had one.
     */
    findByUserId(userId: string): Promise<Subscription | null>;

    /**
     * Reads a billing row by the provider's identifier for it.
     *
     * How a store notification finds the account it concerns: the provider
     * knows its own subscription id and nothing about ours.
     *
     * @param providerSubscriptionId - The provider's identifier.
     * @returns The subscription, or null when no account claims it.
     */
    findByProviderSubscriptionId(
        providerSubscriptionId: string,
    ): Promise<Subscription | null>;

    /**
     * Writes an account's billing row, creating it if there is none.
     *
     * Keyed on the user, because there is exactly one billing relationship per
     * account and it outlives any particular subscription.
     *
     * @param subscription - The state to store.
     * @returns The stored subscription.
     */
    save(subscription: Subscription): Promise<Subscription>;

    /**
     * Sets the account's badge expiry.
     *
     * Separate from {@link save} because the two are written together but read
     * apart: every author query reads `verifiedUntil` and none of them touch
     * this table.
     *
     * @param userId - The account whose badge is being set.
     * @param verifiedUntil - When it expires, or null to remove it.
     */
    setVerifiedUntil(userId: string, verifiedUntil: Date | null): Promise<void>;

    /**
     * Reads the subscriptions the nightly reconcile has to look at.
     *
     * Everything that is still live at the provider, plus everything belonging
     * to an account that has since been suspended or deleted - the second
     * group being the one nothing else will ever notice, because a ban is
     * applied by hand in SQL and has no code path to hook.
     *
     * @param limit - Most rows to return in one pass.
     * @returns The subscriptions to reconcile, with their owner's state.
     */
    findReconcilable(limit: number): Promise<ReconcilableSubscription[]>;
}

/**
 * A subscription, with the little about its owner that reconciliation needs.
 */
export interface ReconcilableSubscription {
    subscription: Subscription;

    /** The account is suspended. */
    isBanned: boolean;

    /** The account is soft-deleted and awaiting purge. */
    isDeleted: boolean;
}
