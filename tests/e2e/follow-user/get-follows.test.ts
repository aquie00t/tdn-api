import { authRequest, parseBody, request } from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * E2E tests for the Get Followers and Get Following endpoints.
 * Validates listing a user's followers/following with correct shape,
 * pagination, computed fields (isFollowing, isMe), and empty states.
 */
describe("GET Follow Lists", () => {
    /**
     * Shared setup:
     * - User A: the target whose followers/following we inspect
     * - User B: follows user A (becomes a follower of A)
     * - User A: follows user B (becomes a followee of A)
     */
    const ts = Date.now();
    const userA = {
        email: `gfl-a-${ts}@test.com`,
        password: "password123",
        username: `gfla${ts}`,
    };
    const userB = {
        email: `gfl-b-${ts}@test.com`,
        password: "password123",
        username: `gflb${ts}`,
    };

    let tokenA = "";
    let tokenB = "";

    /**
     * Registers both users, logs them both in, then:
     * - B follows A (so A has 1 follower)
     * - A follows B (so A is following 1 person)
     */
    beforeAll(async () => {
        const registerA = await request({
            method: "POST",
            url: "/auth/register",
            payload: userA,
        });
        const userAId = parseBody<{ data: { id: string } }>(registerA).data.id;

        const registerB = await request({
            method: "POST",
            url: "/auth/register",
            payload: userB,
        });
        const userBId = parseBody<{ data: { id: string } }>(registerB).data.id;

        const loginA = await request({
            method: "POST",
            url: "/auth/login",
            payload: { identifier: userA.email, password: userA.password },
        });
        tokenA = parseBody<{ data: { accessToken: string } }>(loginA).data
            .accessToken;

        const loginB = await request({
            method: "POST",
            url: "/auth/login",
            payload: { identifier: userB.email, password: userB.password },
        });
        tokenB = parseBody<{ data: { accessToken: string } }>(loginB).data
            .accessToken;

        // B follows A → A gets 1 follower
        await authRequest(tokenB, {
            method: "POST",
            url: "/follows",
            payload: { targetId: userAId },
        });

        // A follows B → A is following 1 person
        await authRequest(tokenA, {
            method: "POST",
            url: "/follows",
            payload: { targetId: userBId },
        });
    });

    describe("GET /profiles/:username/followers - Get User Followers", () => {
        it("should return 404 for an unknown username", async () => {
            // Username resolution moved into the use case; an unknown user
            // must still be a 404 rather than a silently empty 200.
            const response = await request({
                method: "GET",
                url: "/profiles/no_such_user_xyz/followers",
            });

            expect(response.statusCode).toBe(404);
            expect(parseBody<{ title: string }>(response).title).toBe(
                "NotFoundError",
            );
        });

        it("should return 200 with followers array and correct item shape", async () => {
            const response = await request({
                method: "GET",
                url: `/profiles/${userA.username}/followers`,
            });
            const body = parseBody<{
                data: {
                    userId: string;
                    username: string;
                    fullName: string;
                    avatarUrl: string;
                    isFollowing: boolean;
                    isMe: boolean;
                }[];
                meta: { limit: number; offset: number; count: number };
            }>(response);

            expect(response.statusCode).toBe(200);
            expect(Array.isArray(body.data)).toBe(true);
            expect(body.data.length).toBeGreaterThanOrEqual(1);

            const follower = body.data[0];
            expect(follower).toHaveProperty("userId", expect.any(String));
            expect(follower).toHaveProperty("username", expect.any(String));
            expect(follower).toHaveProperty("isFollowing", expect.any(Boolean));
            expect(follower).toHaveProperty("isMe", expect.any(Boolean));

            expect(body.meta).toHaveProperty("limit", expect.any(Number));
            expect(body.meta).toHaveProperty("offset", expect.any(Number));
            expect(body.meta).toHaveProperty("count", expect.any(Number));
        });

        it("should return isMe: false and isFollowing: false for all items (public endpoint)", async () => {
            const response = await request({
                method: "GET",
                url: `/profiles/${userA.username}/followers`,
            });
            const body = parseBody<{
                data: { isMe: boolean; isFollowing: boolean }[];
            }>(response);

            expect(response.statusCode).toBe(200);
            expect(body.data.every((u) => u.isMe === false)).toBe(true);
            expect(body.data.every((u) => u.isFollowing === false)).toBe(true);
        });

        it("should support pagination with limit=1", async () => {
            const response = await request({
                method: "GET",
                url: `/profiles/${userA.username}/followers?limit=1&offset=0`,
            });
            const body = parseBody<{
                data: unknown[];
                meta: { limit: number; offset: number };
            }>(response);

            expect(response.statusCode).toBe(200);
            expect(body.data.length).toBe(1);
            expect(body.meta.limit).toBe(1);
            expect(body.meta.offset).toBe(0);
        });

        it("should return 200 with empty array for a user with no followers", async () => {
            const ts2 = Date.now();
            const newUser = {
                email: `gfl-empty-${ts2}@test.com`,
                password: "password123",
                username: `gflempty${ts2}`,
            };
            await request({
                method: "POST",
                url: "/auth/register",
                payload: newUser,
            });

            const response = await request({
                method: "GET",
                url: `/profiles/${newUser.username}/followers`,
            });
            const body = parseBody<{
                data: unknown[];
                meta: { count: number };
            }>(response);

            expect(response.statusCode).toBe(200);
            expect(body.data).toEqual([]);
            expect(body.meta.count).toBe(0);
        });
    });

    describe("GET /profiles/:username/following - Get User Following", () => {
        it("should return 404 for an unknown username", async () => {
            // Username resolution moved into the use case; an unknown user
            // must still be a 404 rather than a silently empty 200.
            const response = await request({
                method: "GET",
                url: "/profiles/no_such_user_xyz/following",
            });

            expect(response.statusCode).toBe(404);
            expect(parseBody<{ title: string }>(response).title).toBe(
                "NotFoundError",
            );
        });

        it("should return 200 with following array and correct item shape", async () => {
            const response = await request({
                method: "GET",
                url: `/profiles/${userA.username}/following`,
            });
            const body = parseBody<{
                data: {
                    userId: string;
                    username: string;
                    isFollowing: boolean;
                    isMe: boolean;
                }[];
                meta: { limit: number; offset: number; count: number };
            }>(response);

            expect(response.statusCode).toBe(200);
            expect(Array.isArray(body.data)).toBe(true);
            expect(body.data.length).toBeGreaterThanOrEqual(1);

            const following = body.data[0];
            expect(following).toHaveProperty("userId", expect.any(String));
            expect(following).toHaveProperty("username", expect.any(String));
            expect(following).toHaveProperty(
                "isFollowing",
                expect.any(Boolean),
            );
            expect(following).toHaveProperty("isMe", expect.any(Boolean));

            expect(body.meta).toHaveProperty("limit", expect.any(Number));
            expect(body.meta).toHaveProperty("offset", expect.any(Number));
            expect(body.meta).toHaveProperty("count", expect.any(Number));
        });

        it("should support pagination with limit=1", async () => {
            const response = await request({
                method: "GET",
                url: `/profiles/${userA.username}/following?limit=1&offset=0`,
            });
            const body = parseBody<{
                data: unknown[];
                meta: { limit: number; offset: number };
            }>(response);

            expect(response.statusCode).toBe(200);
            expect(body.data.length).toBe(1);
            expect(body.meta.limit).toBe(1);
        });

        it("should return 200 with empty array for a user following nobody", async () => {
            const ts3 = Date.now();
            const newUser = {
                email: `gfl-nf-${ts3}@test.com`,
                password: "password123",
                username: `gflnf${ts3}`,
            };
            await request({
                method: "POST",
                url: "/auth/register",
                payload: newUser,
            });

            const response = await request({
                method: "GET",
                url: `/profiles/${newUser.username}/following`,
            });
            const body = parseBody<{
                data: unknown[];
                meta: { count: number };
            }>(response);

            expect(response.statusCode).toBe(200);
            expect(body.data).toEqual([]);
            expect(body.meta.count).toBe(0);
        });
    });
});
