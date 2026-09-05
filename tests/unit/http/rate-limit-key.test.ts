import { describe, expect, it, vi } from "vitest";
import { rateLimitKeyFor } from "@plugins/rate-limit.plugin";
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

function requestWith(authorization?: string): FastifyRequest {
    return {
        headers: authorization ? { authorization } : {},
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
