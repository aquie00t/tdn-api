import { BillingProvider } from "@core/domain/enums";
import type { IBillingEventRepository } from "@core/ports/repositories/billing-event.repository";
import type { ISubscriptionRepository } from "@core/ports/repositories/subscription.repository";
import type { BillingPort } from "@core/ports/services/billing.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { SyncSubscriptionUseCase } from "@core/use-cases/billing/sync-subscription";
import {
    parsePlayNotification,
    type PlaySubscriptionNotification,
} from "./play-notification";

/**
 * What handling a notification came to.
 *
 * Reported rather than logged and forgotten because the caller has to turn it
 * into a status code, and the difference between "we could not use this" and
 * "try again later" is the difference between Google giving up and Google
 * retrying.
 */
export type PlayNotificationOutcome =
    "applied" | "duplicate" | "unknown-purchase" | "ignored" | "test";

/**
 * Handles the notifications Google pushes about subscriptions.
 *
 * The notification is treated as a *nudge*, never as state. It says a purchase
 * changed; what it changed to is then read from the Play Developer API, and
 * that answer is what gets stored. Notifications arrive out of order and are
 * redelivered, so believing their contents would mean reinstating subscriptions
 * that have ended.
 */
export class PlayNotificationService {
    /**
     * Creates a new instance of PlayNotificationService.
     *
     * @param billingService - Asks Google what is true now
     * @param subscriptionRepository - Finds the account a purchase belongs to
     * @param billingEventRepository - Spots a redelivery, and keeps the trail
     * @param syncSubscriptionUseCase - The one door billing state enters by
     * @param logger - Records what could not be handled
     */
    constructor(
        private readonly billingService: BillingPort,
        private readonly subscriptionRepository: ISubscriptionRepository,
        private readonly billingEventRepository: IBillingEventRepository,
        private readonly syncSubscriptionUseCase: SyncSubscriptionUseCase,
        private readonly logger: LoggerPort,
    ) {}

    /**
     * Handles one pushed notification.
     *
     * @param body - The raw Pub/Sub push body
     * @returns What became of it
     */
    async handle(body: unknown): Promise<PlayNotificationOutcome> {
        const parsed = parsePlayNotification(body);

        if (parsed.kind === "test") return "test";

        if (parsed.kind === "ignored") {
            this.logger.warn(
                { messageId: parsed.messageId, reason: parsed.reason },
                "Ignored a Play notification",
            );

            return "ignored";
        }

        const { notification } = parsed;

        const isNew = await this.billingEventRepository.recordIfNew({
            id: notification.messageId,
            provider: BillingProvider.GOOGLE_PLAY,
            type: notification.typeName,
            providerSubscriptionId: notification.purchaseToken,
        });

        if (!isNew) return "duplicate";

        try {
            return await this.apply(notification);
        } catch (error: unknown) {
            // The delivery was recorded before the work, so a failure here
            // would make Pub/Sub's redelivery look like a duplicate and drop
            // it silently. Releasing the record puts the retry back on the
            // table; the exception then reaches the caller as a 5xx, which is
            // the answer that makes Google send it again.
            await this.billingEventRepository.forget(notification.messageId);

            throw error;
        }
    }

    /**
     * Reads the truth from Google and applies it.
     *
     * @param notification - The delivery being handled
     * @returns What became of it
     */
    private async apply(
        notification: PlaySubscriptionNotification,
    ): Promise<PlayNotificationOutcome> {
        const subscription =
            await this.subscriptionRepository.findByProviderSubscriptionId(
                notification.purchaseToken,
            );

        // A purchase nobody has claimed. It happens legitimately: Google can
        // push the purchase notification before the app's own call arrives.
        // There is no account to apply it to, and inventing one is not an
        // option - the app's authenticated call is the only thing that knows
        // whose purchase this is, and it will sync the state itself.
        if (!subscription) {
            this.logger.warn(
                {
                    messageId: notification.messageId,
                    type: notification.typeName,
                },
                "Play notification for a purchase no account claims",
            );

            return "unknown-purchase";
        }

        const state = await this.billingService.fetchSubscription(
            notification.purchaseToken,
        );

        // The provider cannot say. Left alone rather than guessed at: the
        // expiry already on the row retires the badge if the subscription is
        // really over, and the nightly reconcile will ask again.
        if (!state) return "unknown-purchase";

        await this.syncSubscriptionUseCase.execute({
            userId: subscription.userId,
            provider: BillingProvider.GOOGLE_PLAY,
            state: { ...state, eventAt: state.eventAt ?? notification.eventAt },
        });

        return "applied";
    }
}
