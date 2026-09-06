import type {
    BillingPort,
    ProviderSubscription,
} from "@core/ports/services/billing.port";

/**
 * A billing provider that knows nothing, for deployments with no store behind
 * them.
 *
 * The counterpart of `NoopModerationService` and `NoopPushService`. Everything
 * above the port works without a provider: subscriptions can be read, badges
 * expire on their own, the reconcile pass runs and finds nothing to repair.
 * What cannot happen is a purchase, which is correct - there is nowhere to
 * make one.
 *
 * Note what it does *not* do: it never reports a subscription as active. A
 * stub that granted entitlements would be a way to get a paid badge for free
 * on any environment that forgot to configure a provider.
 */
export class NoopBillingService implements BillingPort {
    /**
     * Reports that nothing is known about the subscription.
     *
     * The reconcile pass reads this as "the provider cannot say" and leaves
     * the row alone, rather than as "it ended".
     *
     * @returns Null, always.
     */
    fetchSubscription(): Promise<ProviderSubscription | null> {
        return Promise.resolve(null);
    }

    /**
     * Accepts a cancellation there is nothing to cancel.
     *
     * True rather than false: the caller's question is whether this account is
     * still being charged, and with no provider the answer is no.
     *
     * @returns True, always.
     */
    cancelSubscription(): Promise<boolean> {
        return Promise.resolve(true);
    }
}
