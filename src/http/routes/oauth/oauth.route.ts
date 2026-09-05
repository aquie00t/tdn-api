/**
 * @module OAuthRoutes
 * OAuth routes including GitHub and Google authentication.
 * @author TDN Team
 * @version 1.0.0
 */

import { RateLimitPolicies } from "@plugins/rate-limit.plugin";
import type { FastifyInstance } from "fastify";
import {
    OAuthExchangeBodySchema,
    OAuthExchangeResponseSchema,
    type OAuthExchangeBody,
} from "@typings/schemas/oauth/oauth-exchange.schema";
import {
    OAuthStartQuerySchema,
    type OAuthStartQuery,
} from "@typings/schemas/oauth/oauth-start.schema";

/**
 * Sets up OAuth routes on the Fastify instance
 *
 * @param fastify - The Fastify application instance
 * @returns void
 */
export function oauthRoutes(fastify: FastifyInstance): void {
    const oauthController = fastify.diContainer.cradle.oauthController;

    fastify.get<{ Querystring: OAuthStartQuery }>(
        "/github",
        {
            config: { rateLimit: RateLimitPolicies.STANDARD },
            schema: {
                querystring: OAuthStartQuerySchema,
                tags: ["OAuth"],
            },
        },
        oauthController.github.bind(oauthController),
    );

    fastify.get<{
        Querystring: { code?: string; error?: string; state?: string };
    }>(
        "/github/callback",
        {
            config: { rateLimit: RateLimitPolicies.STRICT },
            schema: {
                tags: ["OAuth"],
            },
        },
        oauthController.githubCallback.bind(oauthController),
    );

    fastify.get<{ Querystring: OAuthStartQuery }>(
        "/google",
        {
            config: { rateLimit: RateLimitPolicies.STANDARD },
            schema: {
                querystring: OAuthStartQuerySchema,
                tags: ["OAuth"],
            },
        },
        oauthController.google.bind(oauthController),
    );

    fastify.get<{
        Querystring: { code?: string; error?: string; state?: string };
    }>(
        "/google/callback",
        {
            config: { rateLimit: RateLimitPolicies.STRICT },
            schema: {
                tags: ["OAuth"],
            },
        },
        oauthController.googleCallback.bind(oauthController),
    );

    fastify.post<{ Body: OAuthExchangeBody }>(
        "/exchange",
        {
            config: { rateLimit: RateLimitPolicies.STRICT },
            schema: {
                body: OAuthExchangeBodySchema,
                response: { 200: OAuthExchangeResponseSchema },
                tags: ["OAuth"],
            },
        },
        oauthController.exchange.bind(oauthController),
    );
}

export default oauthRoutes;
