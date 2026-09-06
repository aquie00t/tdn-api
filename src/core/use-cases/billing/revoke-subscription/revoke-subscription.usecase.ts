import { Subscription } from "@core/domain/entities/subscription.entity";
import { SubscriptionStatus } from "@core/domain/enums";
import type { ISubscriptionRepository } from "@core/ports/repositories/subscription.repository";
import type { BillingPort } from "@core/ports/services/billing.port";
import type { LoggerPort } from "@core/ports/services/logger.port";

/**
 * Use case for stopping a subscription because the account may no longer have
 * one.
 *
 * The platform promises that a suspended or deleted account stops being
 * charged. Only the provider can keep that promise, so this asks it to - and
 * clears the badge whether or not it answers, because the account has lost the
 * badge either way and a provider that is down must not make a banned user
 * verified for another day.
 */
export class RevokeSubscriptionUseCase {
    /**
     * Creates a new instance of RevokeSubscriptionUseCase.
     *
     * @param subscriptionRepository - Where billing state is stored
     * @param billingService - The provider that is taking the money
     * @param logger - Records a cancellation the provider refused
     */
    constructor(
        private readonly subscriptionRepository: ISubscriptionRepository,
        private readonly billingService: BillingPort,
        private readonly logger: LoggerPort,
    ) {}

    /**
     * Cancels an account's subscription at the provider and locally.
     *
     * Safe to call for an account with no subscription, and safe to call
     * twice: both are the ordinary case when a deletion is retried or a ban is
     * applied to somebody who never paid.
     *
     * @param userId - The account being cut off
     * @returns True when there was something to revoke
     */
    async execute(userId: string): Promise<boolean> {
        const subscription =
            await this.subscriptionRepository.findByUserId(userId);

        if (!subscription) return false;

        if (subscription.status === SubscriptionStatus.REVOKED) return false;

        if (subscription.providerSubscriptionId) {
            try {
                await this.billingService.cancelSubscription(
                    subscription.providerSubscriptionId,
                );
            } catch (error: unknown) {
                // Recorded and carried on. The local state must still say
                // revoked - a provider outage cannot be allowed to leave a
                // banned account wearing a badge - and the nightly reconcile
                // will try the cancellation again.
                this.logger.error(
                    {
                        err: error,
                        userId,
                        providerSubscriptionId:
                            subscription.providerSubscriptionId,
                    },
                    "Provider refused a subscription cancellation",
                );
            }
        }

        await this.subscriptionRepository.save(
            Subscription.with({
                id: subscription.id,
                userId: subscription.userId,
                provider: subscription.provider,
                providerCustomerId: subscription.providerCustomerId,
                providerSubscriptionId: subscription.providerSubscriptionId,
                status: SubscriptionStatus.REVOKED,
                currentPeriodEnd: subscription.currentPeriodEnd,
                cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                lastEventAt: subscription.lastEventAt,
            }),
        );

        await this.subscriptionRepository.setVerifiedUntil(userId, null);

        return true;
    }
}
