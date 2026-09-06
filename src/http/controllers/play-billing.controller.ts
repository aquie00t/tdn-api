import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { UnauthorizedError } from "@core/errors";
import { timingSafeEqual } from "node:crypto";
import type { RegisterPlayPurchaseUseCase } from "@core/use-cases/billing/register-play-purchase";
import type { PlayNotificationService } from "@infrastructure/external/billing/play/play-notification.service";
import type { GoogleOidcVerifier } from "@infrastructure/external/billing/play/google-oidc-verifier";
import type {
    PlayNotificationQuery,
    RegisterPlayPurchaseBody,
} from "@typings/schemas/billing/play.schema";

/**
 * Compares a presented secret with the configured one in constant time.
 *
 * The difference is small here - an attacker would be timing a query string
 * over the internet - but the comparison is cheap to get right and the
 * endpoint it guards writes billing state.
 *
 * Note the remaining weakness this does not address: the secret travels in the
 * query string, so it is written into access logs by this service and by
 * anything in front of it. Pub/Sub push cannot send custom headers, so the
 * proper fix is the OIDC token Google can attach instead, which arrives with
 * the rest of the Play integration.
 *
 * @param presented - What the caller sent, if anything
 * @param expected - The configured secret
 * @returns True when they match
 */
function matchesSecret(
    presented: string | undefined,
    expected: string,
): boolean {
    if (!presented) return false;

    const a = Buffer.from(presented);
    const b = Buffer.from(expected);

    // `timingSafeEqual` throws on a length mismatch, which would itself leak
    // the length; the check is done first and the comparison still runs.
    return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Controller for the Google Play billing endpoints.
 */
export class PlayBillingController {
    /**
     * Creates a new PlayBillingController instance.
     *
     * @param registerPlayPurchaseUseCase - Attaches a purchase to an account
     * @param playNotificationService - Handles what Google pushes
     * @param googleOidcVerifier - Proves a push really came from Google
     * @param config - Environment configuration, for the push secret
     */
    constructor(
        private readonly registerPlayPurchaseUseCase: RegisterPlayPurchaseUseCase,
        private readonly playNotificationService: PlayNotificationService,
        private readonly googleOidcVerifier: GoogleOidcVerifier,
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
        if (!(await this.callerIsGoogle(request))) {
            throw new UnauthorizedError();
        }

        const outcome = await this.playNotificationService.handle(request.body);

        request.log.info(
            { outcome, context: "PlayNotification" },
            "Handled a Play billing notification",
        );

        reply.status(204).send();
    }

    /**
     * Decides whether a push really came from Google.
     *
     * Two mechanisms, and the better one wins where it is available. A signed
     * identity token proves the caller; a shared secret in the query string
     * only proves they have read something that ends up in access logs - ours
     * and every proxy's. The secret stays because a Pub/Sub subscription can
     * be created without OIDC, and a deployment part-way through being wired
     * up should not silently start accepting anything.
     *
     * With neither configured the endpoint is closed, which is the right
     * default for an unauthenticated route that writes billing state.
     *
     * @param request - The push request
     * @returns True when the caller is accepted
     */
    private async callerIsGoogle(
        request: FastifyRequest<{ Querystring: PlayNotificationQuery }>,
    ): Promise<boolean> {
        if (this.googleOidcVerifier.isConfigured) {
            return this.googleOidcVerifier.verify(
                request.headers.authorization,
            );
        }

        const expected = this.config.PLAY_NOTIFICATIONS_TOKEN;

        return (
            Boolean(expected) && matchesSecret(request.query.token, expected)
        );
    }
}
