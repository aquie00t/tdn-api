import { Subscription } from "@core/domain/entities/subscription.entity";
import type { BillingProvider } from "@core/domain/enums";
import type { ISubscriptionRepository } from "@core/ports/repositories/subscription.repository";
import type { ProviderSubscription } from "@core/ports/services/billing.port";
import type { LoggerPort } from "@core/ports/services/logger.port";

/**
 * Input DTO for the SyncSubscriptionUseCase.
 */
export interface SyncSubscriptionInput {
    /**
     * The account the purchase belongs to.
     *
     * Comes from the purchase itself - the store carries an account id the app
     * put there - and not from whoever delivered the notification.
     */
    userId: string;

    provider: BillingProvider;

    /** What the provider currently says is true. */
    state: ProviderSubscription;
}

/**
 * What the sync did, for the caller's log line.
 */
export interface SyncSubscriptionOutput {
    applied: boolean;

    /** Why it was not, when it was not. */
    reason?: "stale-event" | "claimed-by-another-account";

    /** The badge expiry the account ended up with. */
    verifiedUntil: Date | null;
}

/**
 * Use case for writing what a provider says about a subscription.
 *
 * The single door through which billing state enters this system. Every
 * adapter - a store notification, the nightly reconcile, a purchase being
 * verified - arrives here with the provider's *absolute* state rather than a
 * change to apply, which is what makes delivering the same notification twice
 * harmless.
 *
 * It is also the only place that writes `verifiedUntil`, so "when does the tick
 * appear and disappear" has exactly one answer.
 */
export class SyncSubscriptionUseCase {
    /**
     * Creates a new instance of SyncSubscriptionUseCase.
     *
     * @param subscriptionRepository - Where billing state is stored
     * @param logger - Records a refusal somebody will need to explain
     */
    constructor(
        private readonly subscriptionRepository: ISubscriptionRepository,
        private readonly logger: LoggerPort,
    ) {}

    /**
     * Applies the provider's state to the account it belongs to.
     *
     * @param input - Whose subscription, and what the provider says
     * @returns Whether it was applied, and the resulting badge expiry
     */
    async execute(
        input: SyncSubscriptionInput,
    ): Promise<SyncSubscriptionOutput> {
        const { userId, provider, state } = input;

        const claimed =
            await this.subscriptionRepository.findByProviderSubscriptionId(
                state.providerSubscriptionId,
            );

        // One purchase, one account. A store subscription that already belongs
        // to somebody else is refused rather than moved: the alternative is a
        // shared receipt granting a badge to whoever presents it last.
        if (claimed && claimed.userId !== userId) {
            this.logger.error(
                {
                    userId,
                    claimedBy: claimed.userId,
                    providerSubscriptionId: state.providerSubscriptionId,
                },
                "Refused a subscription already claimed by another account",
            );

            return {
                applied: false,
                reason: "claimed-by-another-account",
                verifiedUntil: null,
            };
        }

        const existing =
            claimed ?? (await this.subscriptionRepository.findByUserId(userId));

        // Store notifications are not ordered, and each carries the whole
        // state. An older one applied after a newer one would not just lose an
        // update - it would reinstate a subscription that has ended.
        if (existing && !existing.accepts(state.eventAt ?? null)) {
            return {
                applied: false,
                reason: "stale-event",
                verifiedUntil: existing.entitlementUntil(),
            };
        }

        const subscription = Subscription.with({
            id: existing?.id,
            userId,
            provider,
            providerCustomerId:
                state.providerCustomerId ??
                existing?.providerCustomerId ??
                null,
            providerSubscriptionId: state.providerSubscriptionId,
            status: state.status,
            currentPeriodEnd: state.currentPeriodEnd ?? null,
            cancelAtPeriodEnd: state.cancelAtPeriodEnd ?? false,
            lastEventAt: state.eventAt ?? existing?.lastEventAt ?? null,
        });

        await this.subscriptionRepository.save(subscription);

        const verifiedUntil = subscription.entitlementUntil();

        await this.subscriptionRepository.setVerifiedUntil(
            userId,
            verifiedUntil,
        );

        return { applied: true, verifiedUntil };
    }
}
