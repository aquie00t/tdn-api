import { RateLimitPolicies } from "@plugins/rate-limit.plugin";
import {
    UnsubscribeQuerySchema,
    type UnsubscribeQuery,
} from "@typings/schemas/email/unsubscribe.schema";
import type { FastifyInstance } from "fastify";

/**
 * Routes an email links to.
 *
 * Public and session-free by necessity: a digest is read in an inbox, hours or
 * weeks after any token in it would have expired, so the signed query is the
 * only credential these endpoints get.
 */
export function emailRoutes(fastify: FastifyInstance): void {
    const { emailController } = fastify.diContainer.cradle;

    // Both verbs, one handler. A person clicking the link sends a GET; a mail
    // client's own unsubscribe button sends a bodyless POST, which is what RFC
    // 8058 one-click requires and what Gmail needs before it will show that
    // button at all.
    fastify.route<{ Querystring: UnsubscribeQuery }>({
        method: ["GET", "POST"],
        url: "/emails/unsubscribe",
        schema: {
            querystring: UnsubscribeQuerySchema,
            tags: ["Email"],
        },
        config: { rateLimit: RateLimitPolicies.PUBLIC },
        handler: emailController.unsubscribe.bind(emailController),
    });
}
