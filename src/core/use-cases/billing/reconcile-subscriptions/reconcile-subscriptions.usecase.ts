import type { ISubscriptionRepository } from "@core/ports/repositories/subscription.repository";
import type { BillingPort } from "@core/ports/services/billing.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { RevokeSubscriptionUseCase } from "../revoke-subscription";
import type { SyncSubscriptionUseCase } from "../sync-subscription";

/**
 * What one reconcile pass did.
 */
export interface ReconcileSubscriptionsOutput {
    /** Rows examined. */
    examined: number;

    /** Rows the provider's answer changed. */
    repaired: number;

    /** Subscriptions cancelled because the account may no longer have one. */
    revoked: number;
}

/**
 * Use case for repairing billing state that drifted.
 *
 * Three jobs, one pass:
 *
 * **Bans.** A suspension is applied by hand in SQL - there is no endpoint and
 * no admin panel - so nothing in the code ever hears about it. This is the only
 * thing that will notice, and the promise that a banned account stops being
 * charged rests on it entirely.
 *
 * **Deletions that failed to cancel.** The soft-delete cancels at the provider
 * itself; when that call failed, this is the retry.
 *
 * **Missed notifications.** Store notifications get lost. Because the badge
 * expires on its own the damage is bounded either way, but a subscription that
 * renewed while a notification went missing would otherwise lose its badge at
 * the end of a period the user has already paid past.
 */
export class ReconcileSubscriptionsUseCase {
    /**
     * Creates a new instance of ReconcileSubscriptionsUseCase.
     *
     * @param subscriptionRepository - Where billing state is stored
     * @param billingService - The provider's current view
     * @param syncSubscriptionUseCase - Applies what the provider says
     * @param revokeSubscriptionUseCase - Cuts an account off
     * @param logger - Records what could not be repaired
     */
    constructor(
        private readonly subscriptionRepository: ISubscriptionRepository,
        private readonly billingService: BillingPort,
        private readonly syncSubscriptionUseCase: SyncSubscriptionUseCase,
        private readonly revokeSubscriptionUseCase: RevokeSubscriptionUseCase,
        private readonly logger: LoggerPort,
    ) {}

    /**
     * Runs one pass.
     *
     * @param limit - Most rows to examine
     * @returns What the pass did, for the scheduler's log line
     */
    async execute(limit: number): Promise<ReconcileSubscriptionsOutput> {
        const rows = await this.subscriptionRepository.findReconcilable(limit);

        const output: ReconcileSubscriptionsOutput = {
            examined: rows.length,
            repaired: 0,
            revoked: 0,
        };

        for (const row of rows) {
            const { subscription, isBanned, isDeleted } = row;

            if (isBanned || isDeleted) {
                const revoked = await this.revokeSubscriptionUseCase.execute(
                    subscription.userId,
                );

                if (revoked) output.revoked++;
                continue;
            }

            if (!subscription.providerSubscriptionId) continue;

            try {
                const state = await this.billingService.fetchSubscription(
                    subscription.providerSubscriptionId,
                );

                // A provider that no longer knows the subscription is not the
                // same as one saying it ended, and guessing between them is
                // how a paying user loses a badge. Left alone: the expiry
                // already on the row will retire it if it really is over.
                if (!state) continue;

                const result = await this.syncSubscriptionUseCase.execute({
                    userId: subscription.userId,
                    provider: subscription.provider,
                    // The provider is authoritative here by definition, and a
                    // stored `lastEventAt` from a notification that arrived
                    // later would otherwise make this read look stale.
                    state: { ...state, eventAt: state.eventAt ?? new Date() },
                });

                if (result.applied) output.repaired++;
            } catch (error: unknown) {
                this.logger.error(
                    {
                        err: error,
                        userId: subscription.userId,
                        providerSubscriptionId:
                            subscription.providerSubscriptionId,
                    },
                    "Failed to reconcile a subscription",
                );
            }
        }

        return output;
    }
}
