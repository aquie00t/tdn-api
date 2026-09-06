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
import type { FastifyInstance } from "fastify";

/**
 * Sets up the billing routes on the Fastify instance.
 *
 * @param fastify - The Fastify application instance
 * @returns void
 */
export default function billingRoutes(fastify: FastifyInstance): void {
    const billingController = fastify.diContainer.cradle.billingController;

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
}
