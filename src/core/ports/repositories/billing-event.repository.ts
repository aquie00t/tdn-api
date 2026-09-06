import type { BillingProvider } from "@core/domain/enums";

/**
 * One provider notification, as recorded.
 */
export interface BillingEventRecord {
    /** The provider's own identifier for the delivery. */
    id: string;

    provider: BillingProvider;

    /** The provider's event type, as sent. */
    type: string;

    /** Which subscription it concerned, when it named one. */
    providerSubscriptionId?: string | null;
}

/**
 * Persistence contract for the record of provider notifications.
 */
export interface IBillingEventRepository {
    /**
     * Records a notification, unless it has already been recorded.
     *
     * The insert is the check: providers redeliver, and reading first would
     * leave a window two deliveries of the same event both pass through.
     *
     * Not what makes replays safe - every sync writes the provider's absolute
     * state, so applying one twice lands in the same place. This spares the
     * duplicate work and, more usefully, leaves a trail of what arrived and
     * when, which is the first thing anybody wants when a subscription is in
     * the wrong state.
     *
     * @param event - The notification to record.
     * @returns True when this caller recorded it, false when it was a repeat.
     */
    recordIfNew(event: BillingEventRecord): Promise<boolean>;
}
