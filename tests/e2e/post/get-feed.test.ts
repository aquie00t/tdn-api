import { authRequest, parseBody, request } from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * E2E tests for the GET /posts endpoint.
 * Validates feed retrieval with pagination, filters,
 * optional auth, and auth guards.
 */
describe("GET /posts - Get Post Feed", () => {
    const ts = Date.now();
    const user = {
        email: `pgf-${ts}@test.com`,
        password: "password123",
        username: `pgf${ts}`,
    };
    const userB = {
        email: `pgf-b-${ts}@test.com`,
        password: "password123",
        username: `pgfb${ts}`,
    };

    let accessToken = "";
    let userAId = "";
    let tokenB = "";

    /**
     * Registers a test user, logs in, and creates a post
     * so the feed has at least one item.
     */
    beforeAll(async () => {
        const registerRes = await request({
            method: "POST",
            url: "/auth/register",
            payload: user,
        });
        userAId = parseBody<{ data: { id: string } }>(registerRes).data.id;

        const loginRes = await request({
            method: "POST",
            url: "/auth/login",
            payload: { identifier: user.email, password: user.password },
        });

        accessToken = parseBody<{ data: { accessToken: string } }>(loginRes)
            .data.accessToken;

        await authRequest(accessToken, {
            method: "POST",
            url: "/posts",
            payload: { content: "E2E feed seed post" },
        });

        // Create a BACKEND-categorized post for category filter test
        await authRequest(accessToken, {
            method: "POST",
            url: "/posts",
            payload: { content: "E2E backend post", categories: ["BACKEND"] },
        });

        // Register userB and follow userA for followedOnly test
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

        await authRequest(tokenB, {
            method: "POST",
            url: "/follows",
            payload: { targetId: userAId },
        });
    });

    it("should return 200 with posts array and pagination meta", async () => {
        const response = await authRequest(accessToken, {
            method: "GET",
            url: "/posts",
        });
        const body = parseBody<{
            data: unknown[];
            meta: {
                total: number;
                currentPage: number;
                limit: number;
                totalPages: number;
                nextCursor: string | null;
                hasMore: boolean;
            };
        }>(response);

        expect(response.statusCode).toBe(200);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.meta).toMatchObject({
            total: expect.any(Number),
            currentPage: 1,
            limit: 10,
            totalPages: expect.any(Number),
            hasMore: expect.any(Boolean),
        });
    });

    it("should return 200 with at most 1 item when limit=1", async () => {
        const response = await authRequest(accessToken, {
            method: "GET",
            url: "/posts?page=1&limit=1",
        });
        const body = parseBody<{
            data: unknown[];
            meta: { limit: number; currentPage: number };
        }>(response);

        expect(response.statusCode).toBe(200);
        expect(body.data.length).toBeLessThanOrEqual(1);
        expect(body.meta.limit).toBe(1);
        expect(body.meta.currentPage).toBe(1);
    });

    it("should return 200 with only COMMUNITY posts when type=COMMUNITY", async () => {
        const response = await authRequest(accessToken, {
            method: "GET",
            url: "/posts?type=COMMUNITY",
        });
        const body = parseBody<{ data: { type: string }[] }>(response);

        expect(response.statusCode).toBe(200);
        body.data.forEach((post) => {
            expect(post.type).toBe("COMMUNITY");
        });
    });

    it("should return 200 for unauthenticated requests (public feed)", async () => {
        const response = await request({
            method: "GET",
            url: "/posts",
        });

        expect(response.statusCode).toBe(200);
    });

    it("should return 401 when followedOnly=true without authentication", async () => {
        const response = await request({
            method: "GET",
            url: "/posts?followedOnly=true",
        });
        const body = parseBody<{ title: string }>(response);

        expect(response.statusCode).toBe(401);
        expect(body.title).toBe("UnauthorizedError");
    });

    it("should return 200 with only BACKEND posts when categories=BACKEND", async () => {
        const response = await authRequest(accessToken, {
            method: "GET",
            url: "/posts?categories=BACKEND",
        });
        const body = parseBody<{
            data: { categories: { name: string }[] }[];
        }>(response);

        expect(response.statusCode).toBe(200);
        expect(body.data.length).toBeGreaterThan(0);
        body.data.forEach((post) => {
            expect(post.categories.some((c) => c.name === "BACKEND")).toBe(
                true,
            );
        });
    });

    it("should return 200 with posts from followed users when followedOnly=true", async () => {
        const response = await authRequest(tokenB, {
            method: "GET",
            url: "/posts?followedOnly=true",
        });
        const body = parseBody<{ data: unknown[] }>(response);

        expect(response.statusCode).toBe(200);
        expect(body.data.length).toBeGreaterThanOrEqual(1);
    });

    it("should walk the whole feed by cursor without repeating a post", async () => {
        // The reason cursors exist here: page numbers are recomputed against
        // whatever ranked order is current, and this feed is written to
        // constantly.
        type FeedBody = {
            data: { id: string }[];
            meta: { nextCursor: string | null; hasMore: boolean };
        };

        const seen: string[] = [];
        let cursor: string | null = null;

        for (let page = 0; page < 5; page++) {
            const url: string =
                cursor === null
                    ? "/posts?limit=2"
                    : `/posts?limit=2&cursor=${encodeURIComponent(cursor)}`;

            const response = await authRequest(accessToken, {
                method: "GET",
                url,
            });
            expect(response.statusCode).toBe(200);

            const body = parseBody<FeedBody>(response);
            seen.push(...body.data.map((post) => post.id));

            if (!body.meta.hasMore) break;
            cursor = body.meta.nextCursor;
        }

        expect(seen.length).toBeGreaterThan(0);
        expect(new Set(seen).size).toBe(seen.length);
    });

    it("should serve the first page when handed a cursor it cannot read", async () => {
        // A truncated or stale cursor should not fail a feed request; the
        // reader gets the top of the feed, which is what they wanted anyway.
        const response = await authRequest(accessToken, {
            method: "GET",
            url: "/posts?limit=2&cursor=obviously-not-a-cursor",
        });

        expect(response.statusCode).toBe(200);
        expect(
            parseBody<{ data: unknown[] }>(response).data.length,
        ).toBeGreaterThan(0);
    });

    it("should not show a signed-in reader the same post twice across builds", async () => {
        // Publishing retires the ranked pointer, so the second read rebuilds
        // rather than replaying a cached order - which is exactly when the
        // seen record has to earn its keep.
        //
        // Seeded generously on purpose. The filter is abandoned when it would
        // leave fewer unseen posts than the reader asked for, and the E2E
        // database is otherwise small enough to trip that fallback - which
        // would make this assert something the feed deliberately does not
        // promise.
        for (let i = 0; i < 16; i++) {
            const created = await authRequest(accessToken, {
                method: "POST",
                url: "/posts",
                payload: { content: `E2E seen-set pool post ${i}` },
            });
            expect(created.statusCode).toBe(201);
        }

        type FeedBody = { data: { id: string }[] };

        const first = await authRequest(tokenB, {
            method: "GET",
            url: "/posts?limit=3",
        });
        expect(first.statusCode).toBe(200);
        const firstIds = parseBody<FeedBody>(first).data.map((p) => p.id);
        expect(firstIds).toHaveLength(3);

        await authRequest(accessToken, {
            method: "POST",
            url: "/posts",
            payload: { content: "E2E seen-set rebuild trigger" },
        });

        const second = await authRequest(tokenB, {
            method: "GET",
            url: "/posts?limit=3",
        });
        expect(second.statusCode).toBe(200);
        const secondIds = parseBody<FeedBody>(second).data.map((p) => p.id);

        expect(secondIds).toHaveLength(3);
        expect(secondIds.some((id) => firstIds.includes(id))).toBe(false);
    });

    it("should carry the quote card through the feed, cached or not", async () => {
        const originalRes = await authRequest(accessToken, {
            method: "POST",
            url: "/posts",
            payload: { content: "E2E feed quote target" },
        });
        const originalId = parseBody<{ data: { id: string } }>(originalRes).data
            .id;

        const quoteRes = await authRequest(accessToken, {
            method: "POST",
            url: "/posts",
            payload: {
                content: "E2E feed quote",
                quotedPostId: originalId,
            },
        });
        const quoteId = parseBody<{ data: { id: string } }>(quoteRes).data.id;

        type FeedBody = {
            data: {
                id: string;
                quotedPost: { id: string; createdAt: string } | null;
            }[];
        };

        const findQuote = (body: FeedBody): FeedBody["data"][number] => {
            const found = body.data.find((post) => post.id === quoteId);
            expect(found).toBeDefined();
            return found!;
        };

        const first = await request({ method: "GET", url: "/posts?limit=50" });
        expect(first.statusCode).toBe(200);
        const fromDb = findQuote(parseBody<FeedBody>(first));

        expect(fromDb.quotedPost?.id).toBe(originalId);

        // The second read reuses the cached ranked order instead of rebuilding
        // it. Only the ids are cached and the page is hydrated fresh either
        // way, so the quote card must come back identical.
        const second = await request({ method: "GET", url: "/posts?limit=50" });
        expect(second.statusCode).toBe(200);
        const fromCache = findQuote(parseBody<FeedBody>(second));

        expect(fromCache.quotedPost).toEqual(fromDb.quotedPost);
    });
});
