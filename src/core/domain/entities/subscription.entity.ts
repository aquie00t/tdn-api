import { SubscriptionStatus } from "@core/domain/enums";
import type { BillingProvider } from "@core/domain/enums";
import type { SubscriptionProps } from "@core/domain/interfaces/subscription-props.interface";

/**
 * The statuses that entitle an account to the badge.
 *
 * `IN_GRACE` is in the list on purpose: the provider is still retrying a failed
 * payment, and the period the user already paid for has not ended. Taking the
 * badge away the moment a card is declined would punish an expired card rather
 * than a decision to stop paying.
 */
const ENTITLING_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.IN_GRACE,
]);

/**
 * Rich domain model for one account's billing relationship.
 *
 * The row outlives any particular subscription: it holds the provider's
 * identifiers so that resubscribing attaches to the same customer instead of
 * creating a second one nobody can reconcile.
 */
export class Subscription {
    private constructor(private readonly props: SubscriptionProps) {}

    /**
     * Rebuilds an entity from a persisted row, or composes a new one.
     *
     * @param props - The stored shape
     * @returns The Subscription instance it describes
     */
    public static with(props: SubscriptionProps): Subscription {
        return new Subscription(props);
    }

    get id(): string {
        return this.props.id!;
    }

    get userId(): string {
        return this.props.userId;
    }

    get provider(): BillingProvider {
        return this.props.provider;
    }

    get providerCustomerId(): string | null {
        return this.props.providerCustomerId ?? null;
    }

    get providerSubscriptionId(): string | null {
        return this.props.providerSubscriptionId ?? null;
    }

    get status(): SubscriptionStatus {
        return this.props.status;
    }

    get currentPeriodEnd(): Date | null {
        return this.props.currentPeriodEnd ?? null;
    }

    get cancelAtPeriodEnd(): boolean {
        return this.props.cancelAtPeriodEnd ?? false;
    }

    get lastEventAt(): Date | null {
        return this.props.lastEventAt ?? null;
    }

    /**
     * How long this subscription entitles its owner to the badge.
     *
     * The single place that turns a billing state into a badge. Everything
     * else - reads, the reconcile job, the mappers - asks this rather than
     * interpreting `status` for itself, which is what keeps "when does the
     * tick disappear" from having several answers.
     *
     * A cancelled or revoked subscription entitles nothing, even if its period
     * has not run out: cancellation here means the provider stopped, and
     * revocation means we did.
     *
     * @returns When the badge expires, or null when there is nothing to grant
     */
    public entitlementUntil(): Date | null {
        if (!ENTITLING_STATUSES.has(this.props.status)) return null;

        return this.props.currentPeriodEnd ?? null;
    }

    /**
     * Whether a provider event should be applied to this row.
     *
     * Store notifications are not ordered, and each one carries the whole
     * state rather than a change to it. Applying an older one after a newer
     * one would not merely lose an update - it would reinstate a subscription
     * that has since ended.
     *
     * An event with no timestamp is applied: a provider that does not date its
     * notifications leaves nothing to compare, and refusing them all would
     * mean never updating anything.
     *
     * @param eventAt - When the provider says the event happened
     * @returns True when the event is newer than what this row was built from
     */
    public accepts(eventAt: Date | null): boolean {
        if (!eventAt) return true;

        const lastEventAt = this.props.lastEventAt;

        return !lastEventAt || eventAt.getTime() >= lastEventAt.getTime();
    }

    /**
     * Whether the account is currently entitled to the badge.
     *
     * @param now - Reference time
     * @returns True while the entitlement has not run out
     */
    public isEntitled(now: Date = new Date()): boolean {
        const until = this.entitlementUntil();

        return until !== null && until.getTime() > now.getTime();
    }
}
