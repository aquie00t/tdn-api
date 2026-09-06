import { describe, expect, it, vi } from "vitest";
import {
    rateLimitKeyFor,
    RateLimitPolicies,
} from "@plugins/rate-limit.plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";

/**
 * A Fastify instance whose JWT verifier accepts exactly one token.
 */
function fastifyWith(valid: Record<string, { id?: string }>): FastifyInstance {
    return {
        jwt: {
            verify: vi.fn((token: string) => {
                const payload = valid[token];
                if (!payload) throw new Error("invalid token");
                return payload;
            }),
        },
    } as unknown as FastifyInstance;
}

function requestWith(
    authorization?: string,
    headers: Record<string, string> = {},
): FastifyRequest {
    return {
        headers: authorization ? { authorization, ...headers } : headers,
        ip: "203.0.113.7",
    } as unknown as FastifyRequest;
}

describe("rateLimitKeyFor", () => {
    it("should key an authenticated request on the account", () => {
        const fastify = fastifyWith({ good: { id: "user-1" } });

        expect(rateLimitKeyFor(fastify, requestWith("Bearer good"))).toBe(
            "user:user-1",
        );
    });

    it("should key an anonymous request on the IP", () => {
        expect(rateLimitKeyFor(fastifyWith({}), requestWith())).toBe(
            "203.0.113.7",
        );
    });

    it("should fall back to the IP when the token does not verify", () => {
        // The whole protection would be gone if a forged token could pick its
        // own bucket: an attacker would simply send a different one each time.
        expect(
            rateLimitKeyFor(fastifyWith({}), requestWith("Bearer forged")),
        ).toBe("203.0.113.7");
    });

    it("should fall back to the IP when the token carries no subject", () => {
        const fastify = fastifyWith({ empty: {} });

        expect(rateLimitKeyFor(fastify, requestWith("Bearer empty"))).toBe(
            "203.0.113.7",
        );
    });

    it("should leave a bot token on the IP key", () => {
        // Bot traffic is allow-listed before this runs; if it ever reaches
        // here it must not be handed an account bucket it did not prove.
        const fastify = fastifyWith({ good: { id: "user-1" } });

        expect(rateLimitKeyFor(fastify, requestWith("Bot good"))).toBe(
            "203.0.113.7",
        );
    });
});

describe("RateLimitPolicies.STRICT", () => {
    it("should prefer the edge address over the proxied one", () => {
        // `request.ip` is the left-hand end of X-Forwarded-For, which the
        // client writes. Keying brute-force protection on it hands the caller
        // a fresh bucket per request; the edge header is set by Cloudflare and
        // cannot be supplied from outside.
        const key = RateLimitPolicies.STRICT.keyGenerator(
            requestWith(undefined, { "cf-connecting-ip": "198.51.100.9" }),
        );

        expect(key).toBe("198.51.100.9");
    });

    it("should key on the IP regardless of any token attached", () => {
        // Login and registration run under this policy. If a caller could
        // pick its bucket by attaching a token it already holds, three
        // attempts per quarter hour would become three per account.
        const key = RateLimitPolicies.STRICT.keyGenerator(
            requestWith("Bearer good"),
        );

        expect(key).toBe("203.0.113.7");
    });
});
