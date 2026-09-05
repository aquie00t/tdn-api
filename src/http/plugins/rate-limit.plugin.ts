import fastifyPlugin from "fastify-plugin";
import fastifyRateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { TooManyRequestsError } from "@core/errors";
import { createHash } from "node:crypto";

/**
 * Defines a set of rate limit policies for HTTP endpoints.
 *
 * @remarks
 * Each policy specifies the maximum number of requests allowed within a given time window.
 *
 * @property {object} STRICT - Very restrictive policy, allows only 3 requests per 15 minutes.
 *   - `max`: Maximum number of requests (3)
 *   - `timeWindow`: Time window for rate limiting ("15 minutes")
 *   - `continueExceeding`: If true, continues to apply restrictions after exceeding the limit
 *
 * @property {object} SENSITIVE - Restrictive policy for sensitive endpoints, allows 5 requests per minute.
 *   - `max`: Maximum number of requests (5)
 *   - `timeWindow`: Time window for rate limiting ("1 minute")
 *
 * @property {object} STANDARD - Standard policy, allows 60 requests per minute.
 *   - `max`: Maximum number of requests (60)
 *   - `timeWindow`: Time window for rate limiting ("1 minute")
 *
 * @property {object} PUBLIC - Less restrictive policy for public endpoints, allows 100 requests per minute.
 *   - `max`: Maximum number of requests (100)
 *   - `timeWindow`: Time window for rate limiting ("1 minute")
 */
// jsdoc
export const RateLimitPolicies = {
    STRICT: {
        max: 3,
        timeWindow: "15 minutes",
        continueExceeding: true,
    },
    SENSITIVE: {
        max: 5,
        timeWindow: "1 minute",
    },
    STANDARD: {
        max: 60,
        timeWindow: "1 minute",
    },
    PUBLIC: {
        max: 100,
        timeWindow: "1 minute",
    },
};

/**
 * Registers a global rate limiting plugin for a Fastify instance.
 *
 * This plugin uses `fastify-rate-limit` to limit the number of requests per client.
 * It allows up to 100 requests per minute globally. Requests with a valid bot token
 * (provided in the `Authorization` header as `Bot <token>`) are checked against the
 * database for validity and may be allow-listed.
 *
 * If the rate limit is exceeded, the limiter is handed a `TooManyRequestsError`,
 * which reaches the client as the same RFC 7807 document every other error uses.
 *
 * @param fastify - The Fastify instance to register the rate limit plugin on.
 */
/**
 * The bucket a request is counted in.
 *
 * Authenticated traffic is counted per account, everything else per IP. Carrier
 * NAT puts thousands of mobile subscribers behind one address, and a shared
 * bucket makes the strict policies fire on people who did nothing.
 *
 * The bearer token is verified here rather than read from `request.user`:
 * @fastify/rate-limit registers its own global `onRequest` hook, which runs
 * before a route's `onRequest: [authenticate]`, so `request.user` is still
 * empty at this point. Verifying is an HMAC check and costs little.
 *
 * Unauthenticated endpoints - login, registration, password reset - keep the IP
 * key, which is the whole point of the strict policies on them: there is no
 * account to charge the attempts to yet, and an attacker must not be able to
 * pick their own bucket.
 *
 * @param fastify - Instance carrying the JWT verifier
 * @param request - The incoming request
 * @returns The rate limit key
 */
export function rateLimitKeyFor(
    fastify: FastifyInstance,
    request: FastifyRequest,
): string {
    const auth = request.headers.authorization;

    if (auth?.startsWith("Bearer ")) {
        try {
            const payload = fastify.jwt.verify<{ id?: string }>(
                auth.slice("Bearer ".length).trim(),
            );

            if (payload?.id) return `user:${payload.id}`;
        } catch {
            // Not a token we issued, or no longer valid. It is rejected
            // downstream; here it is simply anonymous.
        }
    }

    return request.ip;
}

function rateLimitPlugin(fastify: FastifyInstance): void {
    fastify.register(fastifyRateLimit, {
        global: true,
        max: 100,
        timeWindow: "1 minute",
        keyGenerator: (request: FastifyRequest): string =>
            rateLimitKeyFor(fastify, request),
        allowList: async (request: FastifyRequest): Promise<boolean> => {
            if (request.server.config.DISABLE_RATE_LIMIT) return true;
            const auth = request.headers.authorization;

            if (!(auth && auth.startsWith("Bot "))) {
                return false;
            }
            const token = auth.split(/\s+/)[1];
            const hashed = createHash("sha256").update(token).digest("hex");

            // A suspended bot loses the allow-list along with everything else.
            // The auth hook would reject its requests anyway; there is no
            // reason to spend the raised budget rejecting them.
            const user = await fastify.prisma.user.findFirst({
                where: { botToken: hashed, isBot: true, bannedAt: null },
            });

            return user !== null;
        },
        // @fastify/rate-limit does `throw errorResponseBuilder(req, ctx)`: it
        // throws whatever this returns. So it has to be an Error carrying a
        // statusCode - a plain problem-document object would be thrown without
        // one and the error handler would render it as a 500 instead of a 429.
        errorResponseBuilder: (_request, context): TooManyRequestsError =>
            new TooManyRequestsError(
                `Too many requests, please try again in ${context.after}.`,
            ),
    });
}

export default fastifyPlugin(rateLimitPlugin);
