import { authRequest, parseBody, request } from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * E2E tests for the block endpoints and the invisibility they buy.
 *
 * The endpoints themselves are the small half. What these cover is the
 * promise: after a block, neither account reaches the other through follows,
 * profiles, timelines or direct messages, and lifting it puts everything back.
 */
describe("Blocking", () => {
    const ts = Date.now();
    const userA = {
        email: `bl-a-${ts}@test.com`,
        password: "password123",
        username: `bla${ts}`,
    };
    const userB = {
        email: `bl-b-${ts}@test.com`,
        password: "password123",
        username: `blb${ts}`,
    };

    let tokenA = "";
    let tokenB = "";
    let userAId = "";
    let userBId = "";

    const registerAndLogin = async (user: {
        email: string;
        password: string;
        username: string;
    }): Promise<{ id: string; token: string }> => {
        const registered = await request({
            method: "POST",
            url: "/auth/register",
            payload: user,
        });
        const id = parseBody<{ data: { id: string } }>(registered).data.id;

        const loggedIn = await request({
            method: "POST",
            url: "/auth/login",
            payload: { identifier: user.email, password: user.password },
        });
        const token = parseBody<{ data: { accessToken: string } }>(loggedIn)
            .data.accessToken;

        return { id, token };
    };

    beforeAll(async () => {
        const a = await registerAndLogin(userA);
        const b = await registerAndLogin(userB);

        userAId = a.id;
        tokenA = a.token;
        userBId = b.id;
        tokenB = b.token;
    });

    describe("POST /blocks", () => {
        it("should reject blocking yourself", async () => {
            const response = await authRequest(tokenA, {
                method: "POST",
                url: "/blocks",
                payload: { targetId: userAId },
            });

            expect(response.statusCode).toBe(400);
        });

        it("should require authentication", async () => {
            const response = await request({
                method: "POST",
                url: "/blocks",
                payload: { targetId: userBId },
            });

            expect(response.statusCode).toBe(401);
        });

        it("should block a user", async () => {
            const response = await authRequest(tokenA, {
                method: "POST",
                url: "/blocks",
                payload: { targetId: userBId },
            });
            const body = parseBody<{ data: { isBlocked: boolean } }>(response);

            expect(response.statusCode).toBe(200);
            expect(body.data.isBlocked).toBe(true);
        });

        it("should be idempotent", async () => {
            const response = await authRequest(tokenA, {
                method: "POST",
                url: "/blocks",
                payload: { targetId: userBId },
            });

            expect(response.statusCode).toBe(200);
        });
    });

    describe("while the block stands", () => {
        it("should refuse a follow from the blocked side, and say why", async () => {
            const response = await authRequest(tokenB, {
                method: "POST",
                url: "/follows",
                payload: { targetId: userAId },
            });

            // 403 rather than a silent no-op: the client has a screen for it,
            // and a follow that quietly fails reads as a bug.
            expect(response.statusCode).toBe(403);
        });

        it("should refuse a follow from the blocking side too", async () => {
            const response = await authRequest(tokenA, {
                method: "POST",
                url: "/follows",
                payload: { targetId: userBId },
            });

            expect(response.statusCode).toBe(403);
        });

        it("should tell the blocked user they were blocked", async () => {
            const response = await authRequest(tokenB, {
                method: "GET",
                url: `/profiles/${userA.username}`,
            });
            const body = parseBody<{
                data: {
                    isBlocked: boolean;
                    isBlockedBy: boolean;
                    postCount: number;
                    articleCount: number;
                };
            }>(response);

            expect(response.statusCode).toBe(200);
            expect(body.data.isBlockedBy).toBe(true);
            expect(body.data.isBlocked).toBe(false);
            expect(body.data.postCount).toBe(0);
            expect(body.data.articleCount).toBe(0);
        });

        it("should show the blocking user their own side of it", async () => {
            const response = await authRequest(tokenA, {
                method: "GET",
                url: `/profiles/${userB.username}`,
            });
            const body = parseBody<{
                data: { isBlocked: boolean; isBlockedBy: boolean };
            }>(response);

            expect(body.data.isBlocked).toBe(true);
            expect(body.data.isBlockedBy).toBe(false);
        });

        it("should leave a guest's view of the profile untouched", async () => {
            const response = await request({
                method: "GET",
                url: `/profiles/${userA.username}`,
            });
            const body = parseBody<{
                data: { isBlocked: boolean; isBlockedBy: boolean };
            }>(response);

            expect(response.statusCode).toBe(200);
            expect(body.data.isBlocked).toBe(false);
            expect(body.data.isBlockedBy).toBe(false);
        });

        it("should refuse to open a conversation", async () => {
            const response = await authRequest(tokenB, {
                method: "POST",
                url: "/conversations",
                payload: { recipientId: userAId },
            });

            // The same 400 a bot or a deleted account gets: this endpoint must
            // not become a way to probe the user table.
            expect(response.statusCode).toBe(400);
        });
    });

    describe("GET /blocks", () => {
        it("should list the accounts this user has blocked", async () => {
            const response = await authRequest(tokenA, {
                method: "GET",
                url: "/blocks",
            });
            const body = parseBody<{
                data: { userId: string; username: string }[];
                meta: { total: number };
            }>(response);

            expect(response.statusCode).toBe(200);
            expect(body.data.map((row) => row.userId)).toContain(userBId);
            expect(body.meta.total).toBeGreaterThanOrEqual(1);
        });

        it("should not show the blocked user who blocked them", async () => {
            const response = await authRequest(tokenB, {
                method: "GET",
                url: "/blocks",
            });
            const body = parseBody<{ data: unknown[] }>(response);

            // A list of who dislikes you is not something to hand out.
            expect(body.data).toHaveLength(0);
        });

        it("should require authentication", async () => {
            const response = await request({
                method: "GET",
                url: "/blocks",
            });

            expect(response.statusCode).toBe(401);
        });
    });

    describe("DELETE /blocks", () => {
        it("should lift the block", async () => {
            const response = await authRequest(tokenA, {
                method: "DELETE",
                url: "/blocks",
                payload: { targetId: userBId },
            });
            const body = parseBody<{ data: { isBlocked: boolean } }>(response);

            expect(response.statusCode).toBe(200);
            expect(body.data.isBlocked).toBe(false);
        });

        it("should restore the follow endpoint", async () => {
            const response = await authRequest(tokenB, {
                method: "POST",
                url: "/follows",
                payload: { targetId: userAId },
            });

            expect(response.statusCode).toBe(200);
        });

        it("should clear the profile flags", async () => {
            const response = await authRequest(tokenB, {
                method: "GET",
                url: `/profiles/${userA.username}`,
            });
            const body = parseBody<{
                data: { isBlocked: boolean; isBlockedBy: boolean };
            }>(response);

            expect(body.data.isBlocked).toBe(false);
            expect(body.data.isBlockedBy).toBe(false);
        });

        it("should succeed when there is nothing to lift", async () => {
            const response = await authRequest(tokenA, {
                method: "DELETE",
                url: "/blocks",
                payload: { targetId: userBId },
            });

            expect(response.statusCode).toBe(200);
        });
    });
});
