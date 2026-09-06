import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { UnauthorizedError } from "@core/errors";
import type { RegisterPlayPurchaseUseCase } from "@core/use-cases/billing/register-play-purchase";
import type { PlayNotificationService } from "@infrastructure/external/billing/play/play-notification.service";
import type {
    PlayNotificationQuery,
    RegisterPlayPurchaseBody,
} from "@typings/schemas/billing/play.schema";

/**
 * Controller for the Google Play billing endpoints.
 */
export class PlayBillingController {
    /**
     * Creates a new PlayBillingController instance.
     *
     * @param registerPlayPurchaseUseCase - Attaches a purchase to an account
     * @param playNotificationService - Handles what Google pushes
     * @param config - Environment configuration, for the push secret
     */
    constructor(
        private readonly registerPlayPurchaseUseCase: RegisterPlayPurchaseUseCase,
        private readonly playNotificationService: PlayNotificationService,
        private readonly config: FastifyInstance["config"],
    ) {}

    /**
     * Takes a completed purchase from the app and verifies it.
     *
     * @param request - The authenticated request carrying the purchase token
     * @param reply - The reply to send
     */
    async registerPurchase(
        request: FastifyRequest<{ Body: RegisterPlayPurchaseBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        const result = await this.registerPlayPurchaseUseCase.execute({
            currentUserId: request.user!.id,
            purchaseToken: request.body.purchaseToken,
            productId: request.body.productId,
        });

        reply.status(200).send({
            data: result,
            meta: { timestamp: new Date().toISOString() },
        });
    }

    /**
     * Receives a subscription notification pushed by Google.
     *
     * Answers 204 for everything it understood, including a duplicate and a
     * purchase no account claims. Pub/Sub retries anything that is not a 2xx,
     * and retrying either of those forever would achieve nothing - the first
     * is already applied and the second needs the app's own call, not another
     * delivery.
     *
     * The genuine retry case is an exception escaping this handler: that
     * reaches the error handler as a 5xx, which is exactly the answer that
     * makes Google try again.
     *
     * @param request - The push request from Pub/Sub
     * @param reply - The reply to send
     *
     * @throws UnauthorizedError - When the push secret does not match
     */
    async notifications(
        request: FastifyRequest<{ Querystring: PlayNotificationQuery }>,
        reply: FastifyReply,
    ): Promise<void> {
        const expected = this.config.PLAY_NOTIFICATIONS_TOKEN;

        // No secret configured means the endpoint is not wired up yet. Closed
        // rather than open: an unauthenticated endpoint that writes billing
        // state is not something to leave ajar by default.
        if (!expected || request.query.token !== expected) {
            throw new UnauthorizedError();
        }

        const outcome = await this.playNotificationService.handle(request.body);

        request.log.info(
            { outcome, context: "PlayNotification" },
            "Handled a Play billing notification",
        );

        reply.status(204).send();
    }
}
