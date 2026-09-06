import type { SubscriptionStatus } from "@core/domain/enums";

/**
 * A subscription as the provider currently describes it.
 *
 * Absolute state, never a change: this is what the store says is true right
 * now, which is what makes applying the same notification twice harmless.
 */
export interface ProviderSubscription {
    providerSubscriptionId: string;

    /** The provider's identifier for the payer, when it exposes one. */
    providerCustomerId?: string | null;

    status: SubscriptionStatus;

    /** When the paid period ends, if there is one. */
    currentPeriodEnd?: Date | null;

    /** The user has cancelled but the paid period is still running. */
    cancelAtPeriodEnd?: boolean;

    /** When the provider says this state was reached. */
    eventAt?: Date | null;
}

/**
 * Port interface for talking to whichever store or gateway is billing.
 *
 * Two operations, because there are only two things the core needs from a
 * provider: what does it say the state is, and please stop charging. Starting
 * a purchase belongs to the client and the store, and nothing here should be
 * able to move money.
 */
export interface BillingPort {
    /**
     * Reads the provider's current view of a subscription.
     *
     * Used by the nightly reconcile to repair anything a missed notification
     * left behind.
     *
     * @param providerSubscriptionId - The provider's identifier.
     * @returns The state, or null when the provider no longer knows it.
     */
    fetchSubscription(
        providerSubscriptionId: string,
    ): Promise<ProviderSubscription | null>;

    /**
     * Stops a subscription at the provider, immediately.
     *
     * Used when an account is suspended or deleted: this platform promises
     * that neither keeps being charged, and that promise can only be kept by
     * whoever is taking the money.
     *
     * @param providerSubscriptionId - The provider's identifier.
     * @returns True when the provider accepted the cancellation.
     */
    cancelSubscription(providerSubscriptionId: string): Promise<boolean>;
}
