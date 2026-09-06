/**
 * Billing routes module
 *
 * One endpoint today: what does my subscription look like. Purchasing happens
 * in the store, and the notification that follows it belongs to the store
 * adapter rather than here.
 *
 * @author TDN Team
 * @version 1.0.0
 */

import { RateLimitPolicies } from "@plugins/rate-limit.plugin";
import { SubscriptionResponseSchema } from "@typings/schemas/billing/subscription.schema";
import {
    PlayNotificationQuerySchema,
    RegisterPlayPurchaseBodySchema,
    RegisterPlayPurchaseResponseSchema,
    type PlayNotificationQuery,
    type RegisterPlayPurchaseBody,
} from "@typings/schemas/billing/play.schema";
import type { FastifyInstance } from "fastify";

/**
 * Sets up the billing routes on the Fastify instance.
 *
 * @param fastify - The Fastify application instance
 * @returns void
 */
export default function billingRoutes(fastify: FastifyInstance): void {
    const billingController = fastify.diContainer.cradle.billingController;
    const playBillingController =
        fastify.diContainer.cradle.playBillingController;

    fastify.get(
        "/billing/subscription",
        {
            schema: {
                response: { 200: SubscriptionResponseSchema },
                tags: ["Billing"],
            },
            onRequest: [fastify.authenticate],
            config: { rateLimit: RateLimitPolicies.STANDARD },
        },
        billingController.subscription.bind(billingController),
    );

    fastify.post<{ Body: RegisterPlayPurchaseBody }>(
        "/billing/play/purchases",
        {
            schema: {
                body: RegisterPlayPurchaseBodySchema,
                response: { 200: RegisterPlayPurchaseResponseSchema },
                tags: ["Billing"],
            },
            onRequest: [fastify.authenticate],
            config: {
                // A retried hand-over is already harmless - the sync writes
                // the provider's absolute state onto one row per account - but
                // the claim spares a second verification round trip to Google,
                // and this is exactly the call a phone retries: it fires right
                // after a purchase, when the app has just come back from the
                // Play sheet.
                idempotency: true,
                rateLimit: RateLimitPolicies.SENSITIVE,
            },
        },
        playBillingController.registerPurchase.bind(playBillingController),
    );

    /**
     * Where Google pushes subscription notifications.
     *
     * Unauthenticated in the session sense - Pub/Sub carries no account - and
     * guarded by a shared secret on the URL instead. It is deliberately exempt
     * from the standard rate limit: Google decides how often it calls, and
     * answering 429 only makes it call again.
     */
    fastify.post<{ Querystring: PlayNotificationQuery }>(
        "/billing/play/notifications",
        {
            schema: {
                querystring: PlayNotificationQuerySchema,
                tags: ["Billing"],
            },
            config: { rateLimit: false },
        },
        playBillingController.notifications.bind(playBillingController),
    );
}
