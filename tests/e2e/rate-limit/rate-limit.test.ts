import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { App } from "../../../src/app";
import type {
    FastifyInstance,
    InjectOptions,
    LightMyRequestResponse,
} from "fastify";
import { API_PREFIX, parseBody } from "../setup";
import { BOT_USER } from "../test-constants";

/**
 * Rate Limit Policy Tests
 *
 * These tests use their own Fastify instance with DISABLE_RATE_LIMIT=false
 * so that real rate limiting is active, independently of the shared E2E setup
 * which sets DISABLE_RATE_LIMIT=true via .env.test.
 *
 * Test order within each describe block matters: requests accumulate in the
 * in-memory rate limit store of the dedicated Fastify instance.
 *
 * Route → Policy mapping used in this file:
 *   POST /api/v1/auth/login   → STRICT    (max 3 / 15 min, continueExceeding)
 *   POST /api/v1/auth/refresh → SENSITIVE (max 5 / 1 min)
 */

let rlApp: App;
let rlServer: FastifyInstance;

beforeAll(async () => {
    process.env.DISABLE_RATE_LIMIT = "false";
    rlApp = new App();
    await rlApp.init();
    rlServer = rlApp.instance;
});

afterAll(async () => {
    await rlApp.close();
    process.env.DISABLE_RATE_LIMIT = "true";
});

function request(
    opts: Omit<InjectOptions, "url"> & { url: string },
): Promise<LightMyRequestResponse> {
    return rlServer.inject({ ...opts, url: `${API_PREFIX}${opts.url}` });
}

describe("Rate Limit Policies", () => {
    describe("STRICT policy — POST /auth/login (max 3 / 15 min)", () => {
        it("should allow the first 3 requests (returning non-429)", async () => {
            for (let i = 0; i < 3; i++) {
                const res = await request({
                    method: "POST",
                    url: "/auth/login",
                    payload: {
                        identifier: "nobody@rate-limit-test.com",
                        password: "wrongpassword",
                    },
                });
                expect(
                    res.statusCode,
                    `request ${i + 1} should not be 429`,
                ).not.toBe(429);
            }
        });

        it("should return 429 on the 4th request", async () => {
            const res = await request({
                method: "POST",
                url: "/auth/login",
                payload: {
                    identifier: "nobody@rate-limit-test.com",
                    password: "wrongpassword",
                },
            });

            expect(res.statusCode).toBe(429);

            const body = parseBody<{
                type: string;
                title: string;
                status: number;
                detail: string;
                instance: string;
            }>(res);
            expect(body.type).toBe("about:blank");
            expect(body.title).toBe("TooManyRequestsError");
            expect(body.status).toBe(429);
            expect(body.instance).toBe("/api/v1/auth/login");
            // The limiter knows how long the window has left, so the client
            // can say when to try again instead of guessing.
            expect(body.detail).toMatch(
                /^Too many requests, please try again in .+\.$/,
            );
        });

        it("should still return 429 on the 5th request (continueExceeding resets the window)", async () => {
            const res = await request({
                method: "POST",
                url: "/auth/login",
                payload: {
                    identifier: "nobody@rate-limit-test.com",
                    password: "wrongpassword",
                },
            });

            expect(res.statusCode).toBe(429);
        });

        it("should keep the limiter's own headers on the rejected response", async () => {
            const res = await request({
                method: "POST",
                url: "/auth/login",
                payload: {
                    identifier: "nobody@rate-limit-test.com",
                    password: "wrongpassword",
                },
            });

            expect(res.statusCode).toBe(429);
            expect(res.headers["retry-after"]).toBeDefined();
            expect(res.headers["x-ratelimit-limit"]).toBeDefined();
            expect(res.headers["x-ratelimit-reset"]).toBeDefined();
        });
    });

    describe("SENSITIVE policy — POST /auth/refresh (max 5 / 1 min)", () => {
        it("should allow the first 5 requests (returning non-429)", async () => {
            for (let i = 0; i < 5; i++) {
                const res = await request({
                    method: "POST",
                    url: "/auth/refresh",
                });
                expect(
                    res.statusCode,
                    `request ${i + 1} should not be 429`,
                ).not.toBe(429);
            }
        });

        it("should return 429 on the 6th request", async () => {
            const res = await request({ method: "POST", url: "/auth/refresh" });
            expect(res.statusCode).toBe(429);

            // Every tier answers through the same builder, so a 429 is a
            // problem document here exactly as it is under STRICT.
            const body = parseBody<{ title: string; status: number }>(res);
            expect(body.title).toBe("TooManyRequestsError");
            expect(body.status).toBe(429);
        });
    });

    describe("Bot token allowlist", () => {
        it("should bypass rate limits with a valid bot token even after STRICT limit is exceeded", async () => {
            // /auth/login already has 6 requests above (all rejected after 4th).
            // Requests with a valid bot token should bypass the limit entirely.
            for (let i = 0; i < 3; i++) {
                const res = await request({
                    method: "POST",
                    url: "/auth/login",
                    payload: {
                        identifier: "nobody@rate-limit-test.com",
                        password: "wrongpassword",
                    },
                    headers: { authorization: `Bot ${BOT_USER.plainToken}` },
                });
                expect(
                    res.statusCode,
                    `bot request ${i + 1} should not be 429`,
                ).not.toBe(429);
            }
        });
    });
});
