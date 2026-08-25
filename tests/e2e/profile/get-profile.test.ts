import { authRequest, parseBody, request } from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * E2E tests for the GET /profiles/:username endpoint.
 * Validates profile retrieval for authenticated and unauthenticated users,
 * proper isMe/isFollowing flags, and 404 handling.
 */
describe("GET /profiles/:username - Get Profile", () => {
    const ts = Date.now();
    const userA = {
        email: `prga-${ts}@test.com`,
        password: "password123",
        username: `prga${ts}`,
    };
    const userB = {
        email: `prgb-${ts}@test.com`,
        password: "password123",
        username: `prgb${ts}`,
    };

    let tokenA = "";
    let tokenB = "";

    /**
     * Registers two users and logs in as both.
     */
    beforeAll(async () => {
        await request({
            method: "POST",
            url: "/auth/register",
            payload: userA,
        });

        const loginA = await request({
            method: "POST",
            url: "/auth/login",
            payload: { identifier: userA.email, password: userA.password },
        });
        tokenA = parseBody<{ data: { accessToken: string } }>(loginA).data
            .accessToken;

        await request({
            method: "POST",
            url: "/auth/register",
            payload: userB,
        });

        const loginB = await request({
            method: "POST",
            url: "/auth/login",
            payload: { identifier: userB.email, password: userB.password },
        });
        tokenB = parseBody<{ data: { accessToken: string } }>(loginB).data
            .accessToken;
    });

    it("should return 200 with full profile data and isMe: true for own profile", async () => {
        const response = await authRequest(tokenA, {
            method: "GET",
            url: `/profiles/${userA.username}`,
        });
        const body = parseBody<{
            data: {
                username: string;
                avatarUrl: string;
                bannerUrl: string;
                followersCount: number;
                followingCount: number;
                postCount: number;
                articleCount: number;
                isMe: boolean;
                isFollowing: boolean;
            };
            meta: { timestamp: string };
        }>(response);

        expect(response.statusCode).toBe(200);
        expect(body.data.username).toBe(userA.username);
        expect(body.data.isMe).toBe(true);
        expect(body.data.isFollowing).toBe(false);
        expect(body.data.followersCount).toEqual(expect.any(Number));
        expect(body.data.followingCount).toEqual(expect.any(Number));
        expect(body.data.postCount).toEqual(expect.any(Number));
        expect(body.data.articleCount).toEqual(expect.any(Number));
        expect(body.data.avatarUrl).toEqual(expect.any(String));
        expect(body.data.bannerUrl).toEqual(expect.any(String));
        expect(body.meta).toHaveProperty("timestamp", expect.any(String));
    });

    it("should return 200 with isMe: false and isFollowing: false for another user (unauthenticated)", async () => {
        const response = await request({
            method: "GET",
            url: `/profiles/${userA.username}`,
        });
        const body = parseBody<{
            data: { isMe: boolean; isFollowing: boolean };
        }>(response);

        expect(response.statusCode).toBe(200);
        expect(body.data.isMe).toBe(false);
        expect(body.data.isFollowing).toBe(false);
    });

    it("should return 200 with isFollowing: true after following a user", async () => {
        // Seed: B follows A
        await authRequest(tokenB, {
            method: "POST",
            url: "/follows",
            payload: {
                targetId: parseBody<{ data: { id: string } }>(
                    await request({
                        method: "GET",
                        url: `/profiles/${userA.username}`,
                    }),
                ).data.id,
            },
        });

        // Get userA profile from A's perspective (isFollowing should be false — can't follow yourself)
        const response = await authRequest(tokenB, {
            method: "GET",
            url: `/profiles/${userA.username}`,
        });
        const body = parseBody<{
            data: { isMe: boolean; isFollowing: boolean };
        }>(response);

        expect(response.statusCode).toBe(200);
        expect(body.data.isMe).toBe(false);
        expect(body.data.isFollowing).toBe(true);
    });

    it("should return 404 when the profile does not exist", async () => {
        const response = await request({
            method: "GET",
            url: "/profiles/no_such_user_xyz",
        });
        const body = parseBody<{ title: string; detail: string }>(response);

        expect(response.statusCode).toBe(404);
        expect(body.title).toBe("NotFoundError");
        expect(body.detail).toBe("Profile not found.");
    });


    describe("GET /profiles/:username - articleCount", () => {
        /**
         * Reads the article count off a profile as the given viewer.
         */
        const readCount = async (token?: string): Promise<number> => {
            const response = token
                ? await authRequest(token, {
                      method: "GET",
                      url: `/profiles/${userA.username}`,
                  })
                : await request({
                      method: "GET",
                      url: `/profiles/${userA.username}`,
                  });
            return parseBody<{ data: { articleCount: number } }>(response).data
                .articleCount;
        };

        it("should not count a draft", async () => {
            const before = await readCount(tokenA);

            await authRequest(tokenA, {
                method: "POST",
                url: "/articles",
                payload: {
                    title: `Uncounted draft ${Date.now()}`,
                    body: "Body prose for the draft.",
                },
            });

            expect(await readCount(tokenA)).toBe(before);
        });

        it("should count a published article", async () => {
            const before = await readCount(tokenA);

            const created = await authRequest(tokenA, {
                method: "POST",
                url: "/articles",
                payload: {
                    title: `Counted article ${Date.now()}`,
                    body: "Body prose for the published article.",
                },
            });
            const { id } = parseBody<{ data: { id: string } }>(created).data;

            await authRequest(tokenA, {
                method: "POST",
                url: `/articles/${id}/publish`,
            });

            expect(await readCount(tokenA)).toBe(before + 1);
        });

        it("should report the same count to the owner, a stranger and a guest", async () => {
            // Published-only, so a viewer-dependent number would mean the owner
            // was being shown how much unpublished work exists.
            const asOwner = await readCount(tokenA);
            const asStranger = await readCount(tokenB);
            const asGuest = await readCount();

            expect(asStranger).toBe(asOwner);
            expect(asGuest).toBe(asOwner);
        });

        it("should stop counting an article once it is archived", async () => {
            const created = await authRequest(tokenA, {
                method: "POST",
                url: "/articles",
                payload: {
                    title: `Archivable article ${Date.now()}`,
                    body: "Body prose.",
                },
            });
            const { id } = parseBody<{ data: { id: string } }>(created).data;

            await authRequest(tokenA, {
                method: "POST",
                url: `/articles/${id}/publish`,
            });
            const published = await readCount(tokenA);

            await authRequest(tokenA, {
                method: "POST",
                url: `/articles/${id}/archive`,
            });

            expect(await readCount(tokenA)).toBe(published - 1);
        });
    });
});