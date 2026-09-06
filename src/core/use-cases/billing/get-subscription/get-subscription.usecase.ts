import type { SubscriptionStatus } from "@core/domain/enums";
import type { ISubscriptionRepository } from "@core/ports/repositories/subscription.repository";

/**
 * What the client needs to render the subscription screen.
 */
export interface GetSubscriptionOutput {
    /** Whether the badge is currently granted. */
    isVerified: boolean;

    /** When it expires, or null when there is nothing granted. */
    verifiedUntil: Date | null;

    /** Null for an account that has never subscribed. */
    status: SubscriptionStatus | null;

    /** When the paid period ends. */
    currentPeriodEnd: Date | null;

    /** The user cancelled, but the period they paid for is still running. */
    cancelAtPeriodEnd: boolean;
}

/**
 * Use case for reading an account's own subscription.
 *
 * Reports state, never receipts or amounts: the store owns those and shows
 * them to the user itself, and the client needs none of it to decide between
 * "subscribe", "you are subscribed" and "your subscription ends on the 14th".
 */
export class GetSubscriptionUseCase {
    /**
     * Creates a new instance of GetSubscriptionUseCase.
     *
     * @param subscriptionRepository - Where billing state is stored
     */
    constructor(
        private readonly subscriptionRepository: ISubscriptionRepository,
    ) {}

    /**
     * Reads the caller's subscription.
     *
     * @param userId - The account asking about itself
     * @returns Its state, all nulls for an account that never subscribed
     */
    async execute(userId: string): Promise<GetSubscriptionOutput> {
        const subscription =
            await this.subscriptionRepository.findByUserId(userId);

        if (!subscription) {
            return {
                isVerified: false,
                verifiedUntil: null,
                status: null,
                currentPeriodEnd: null,
                cancelAtPeriodEnd: false,
            };
        }

        return {
            isVerified: subscription.isEntitled(),
            verifiedUntil: subscription.entitlementUntil(),
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        };
    }
}
