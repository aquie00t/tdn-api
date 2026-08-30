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
            };
        }>(response);

        expect(response.statusCode).toBe(200);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.meta).toMatchObject({
            total: expect.any(Number),
            currentPage: 1,
            limit: 10,
            totalPages: expect.any(Number),
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

        // The second read is served from the 60-second feed cache. The dates in
        // it are revived by hand, so the shape must not drift between the two.
        const second = await request({ method: "GET", url: "/posts?limit=50" });
        expect(second.statusCode).toBe(200);
        const fromCache = findQuote(parseBody<FeedBody>(second));

        expect(fromCache.quotedPost).toEqual(fromDb.quotedPost);
    });
});
