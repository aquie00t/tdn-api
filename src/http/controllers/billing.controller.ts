import type { GetSubscriptionUseCase } from "@core/use-cases/billing/get-subscription";
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Controller for the subscription endpoints.
 */
export class BillingController {
    /**
     * Creates a new BillingController instance.
     *
     * @param getSubscriptionUseCase - Use case that reads an account's own
     * subscription
     */
    constructor(
        private readonly getSubscriptionUseCase: GetSubscriptionUseCase,
    ) {}

    /**
     * Reads the caller's subscription.
     *
     * Only ever the caller's own: there is no path here that takes a user id,
     * because whether somebody pays is not other people's business. What *is*
     * public is the badge, and that already travels on every profile.
     *
     * @param request - The authenticated request
     * @param reply - The reply to send
     */
    async subscription(
        request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        const subscription = await this.getSubscriptionUseCase.execute(
            request.user!.id,
        );

        reply.status(200).send({
            data: {
                ...subscription,
                verifiedUntil:
                    subscription.verifiedUntil?.toISOString() ?? null,
                currentPeriodEnd:
                    subscription.currentPeriodEnd?.toISOString() ?? null,
            },
            meta: { timestamp: new Date().toISOString() },
        });
    }
}
