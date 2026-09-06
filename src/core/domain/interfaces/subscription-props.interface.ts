import type { BillingProvider, SubscriptionStatus } from "@core/domain/enums";

/**
 * The persisted shape of one account's billing relationship.
 */
export interface SubscriptionProps {
    /** Set once persisted. */
    id?: string;

    userId: string;

    provider: BillingProvider;

    /** The provider's identifier for the payer, kept across resubscriptions. */
    providerCustomerId?: string | null;

    /** The provider's identifier for the current subscription. */
    providerSubscriptionId?: string | null;

    status: SubscriptionStatus;

    /** When the paid period ends. */
    currentPeriodEnd?: Date | null;

    /** The user cancelled, but the period they paid for is still running. */
    cancelAtPeriodEnd?: boolean;

    /**
     * Timestamp of the provider event this row was last written from.
     *
     * The out-of-order guard: store notifications are not ordered, and each
     * carries the whole state rather than a change to it.
     */
    lastEventAt?: Date | null;

    createdAt?: Date;

    updatedAt?: Date;
}
