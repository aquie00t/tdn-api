/**
 * Where a subscription stands, in the provider's terms.
 *
 * Deliberately close to what the stores report rather than a tidier scheme of
 * our own: every value here arrives from outside, and a translation layer
 * would only give two vocabularies a chance to disagree.
 *
 * Mirrors the `SubscriptionStatus` enum in the Prisma schema exactly.
 */
export enum SubscriptionStatus {
    /** Purchase started, payment not yet confirmed. */
    PENDING = "PENDING",

    ACTIVE = "ACTIVE",

    /**
     * Payment failed and the provider is retrying.
     *
     * The badge stays on: the user paid for the period they are in, and the
     * provider has not given up on collecting the next one.
     */
    IN_GRACE = "IN_GRACE",

    /** The provider gave up, or the user let it lapse. */
    CANCELED = "CANCELED",

    /** Ended because we cancelled it - a ban, or a deleted account. */
    REVOKED = "REVOKED",
}
