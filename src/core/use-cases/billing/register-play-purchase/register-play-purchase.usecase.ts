import { BillingProvider, SubscriptionStatus } from "@core/domain/enums";
import type { BillingPort } from "@core/ports/services/billing.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { SyncSubscriptionUseCase } from "../sync-subscription";

/**
 * Input DTO for the RegisterPlayPurchaseUseCase.
 */
export interface RegisterPlayPurchaseInput {
    /** The account that made the purchase, from its own session. */
    currentUserId: string;

    /** Google's identifier for the purchase, from the billing library. */
    purchaseToken: string;

    /** The subscription product that was bought. */
    productId: string;
}

/**
 * Use case for attaching a Play purchase to the account that made it.
 *
 * This call is the only place the link between a purchase and an account is
 * ever learned. Google's notifications name a purchase token and a product and
 * nothing else; the account behind it is known here, and only here, because
 * this request carries a session.
 *
 * It grants nothing on the client's word. The token is handed straight to the
 * provider for verification, and what comes back is what gets stored - so a
 * fabricated token buys a row that says `PENDING` and no badge.
 */
export class RegisterPlayPurchaseUseCase {
    /**
     * Creates a new instance of RegisterPlayPurchaseUseCase.
     *
     * @param billingService - Asks Google what the purchase actually is
     * @param syncSubscriptionUseCase - The one door billing state enters by
     * @param logger - Records a purchase the provider could not confirm
     */
    constructor(
        private readonly billingService: BillingPort,
        private readonly syncSubscriptionUseCase: SyncSubscriptionUseCase,
        private readonly logger: LoggerPort,
    ) {}

    /**
     * Records the purchase and applies whatever the provider says about it.
     *
     * @param input - Who bought what
     * @returns Whether the badge is granted as a result
     *
     * @remarks
     * When the provider cannot confirm the purchase - no adapter configured
     * yet, or Google momentarily unreachable - the link is still written, as
     * `PENDING`. That grants nothing, and it is what lets the nightly
     * reconcile finish the job later: without the row, nothing would ever
     * connect this token to this account again.
     */
    async execute(input: RegisterPlayPurchaseInput): Promise<{
        isVerified: boolean;
    }> {
        const state = await this.billingService.fetchSubscription(
            input.purchaseToken,
        );

        if (!state) {
            this.logger.warn(
                {
                    userId: input.currentUserId,
                    productId: input.productId,
                },
                "Play purchase could not be confirmed; linking it as pending",
            );
        }

        const result = await this.syncSubscriptionUseCase.execute({
            userId: input.currentUserId,
            provider: BillingProvider.GOOGLE_PLAY,
            state: state ?? {
                providerSubscriptionId: input.purchaseToken,
                status: SubscriptionStatus.PENDING,
                eventAt: new Date(),
            },
        });

        return { isVerified: result.verifiedUntil !== null };
    }
}
