import { authRequest, parseBody, request } from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

const FAKE_UUID = "00000000-0000-0000-0000-000000000000";

interface QuoteItem {
    id: string;
    content: string;
    quotedPost: { id: string; content: string } | null;
}

interface QuotesBody {
    data: QuoteItem[];
    meta: {
        total: number;
        currentPage: number;
        limit: number;
        totalPages: number;
    };
}

/**
 * E2E tests for GET /posts/:id/quotes.
 *
 * This is where the quote count leads: the page of posts behind the number.
 */
describe("GET /posts/:id/quotes - List quotes of a post", () => {
    const ts = Date.now();
    const user = {
        email: `pq-${ts}@test.com`,
        password: "password123",
        username: `pq${ts}`,
    };

    let accessToken = "";
    let originalPostId = "";
    let lonelyPostId = "";
    let firstQuoteId = "";
    let secondQuoteId = "";

    async function createPost(
        payload: Record<string, unknown>,
    ): Promise<string> {
        const response = await authRequest(accessToken, {
            method: "POST",
            url: "/posts",
            payload,
        });
        expect(response.statusCode).toBe(201);
        return parseBody<{ data: { id: string } }>(response).data.id;
    }

    /**
     * Registers a user, then leaves behind one post with two quotes and one
     * post nobody has quoted.
     */
    beforeAll(async () => {
        await request({
            method: "POST",
            url: "/auth/register",
            payload: user,
        });

        const loginRes = await request({
            method: "POST",
            url: "/auth/login",
            payload: { identifier: user.email, password: user.password },
        });
        accessToken = parseBody<{ data: { accessToken: string } }>(loginRes)
            .data.accessToken;

        originalPostId = await createPost({ content: "The quoted original" });
        lonelyPostId = await createPost({ content: "Nobody quotes this" });

        firstQuoteId = await createPost({
            content: "First quote",
            quotedPostId: originalPostId,
        });
        secondQuoteId = await createPost({
            content: "Second quote",
            quotedPostId: originalPostId,
        });
    });

    it("should return the quotes newest first, each carrying its card", async () => {
        const response = await request({
            method: "GET",
            url: `/posts/${originalPostId}/quotes`,
        });
        const body = parseBody<QuotesBody>(response);

        expect(response.statusCode).toBe(200);
        expect(body.meta.total).toBe(2);
        expect(body.data.map((item) => item.id)).toEqual([
            secondQuoteId,
            firstQuoteId,
        ]);
        body.data.forEach((item) => {
            expect(item.quotedPost?.id).toBe(originalPostId);
            expect(item.quotedPost?.content).toBe("The quoted original");
        });
    });

    it("should paginate", async () => {
        const response = await request({
            method: "GET",
            url: `/posts/${originalPostId}/quotes?page=1&limit=1`,
        });
        const body = parseBody<QuotesBody>(response);

        expect(response.statusCode).toBe(200);
        expect(body.data).toHaveLength(1);
        expect(body.meta).toMatchObject({
            total: 2,
            currentPage: 1,
            limit: 1,
            totalPages: 2,
        });
    });

    it("should return an empty page for a post nobody has quoted", async () => {
        const response = await request({
            method: "GET",
            url: `/posts/${lonelyPostId}/quotes`,
        });
        const body = parseBody<QuotesBody>(response);

        expect(response.statusCode).toBe(200);
        expect(body.data).toEqual([]);
        expect(body.meta.total).toBe(0);
    });

    it("should return 404 when the post itself does not exist", async () => {
        // "No quotes" and "no such post" must stay different answers.
        const response = await request({
            method: "GET",
            url: `/posts/${FAKE_UUID}/quotes`,
        });
        const body = parseBody<{ title: string }>(response);

        expect(response.statusCode).toBe(404);
        expect(body.title).toBe("NotFoundError");
    });

    it("should return 400 for an id that is not a uuid", async () => {
        const response = await request({
            method: "GET",
            url: "/posts/not-a-uuid/quotes",
        });

        expect(response.statusCode).toBe(400);
    });

    it("should fill in the caller's own like state when authenticated", async () => {
        const response = await authRequest(accessToken, {
            method: "GET",
            url: `/posts/${originalPostId}/quotes`,
        });
        const body = parseBody<{
            data: { isLiked: boolean; author: { isMe: boolean } }[];
        }>(response);

        expect(response.statusCode).toBe(200);
        body.data.forEach((item) => {
            expect(item.isLiked).toBe(false);
            expect(item.author.isMe).toBe(true);
        });
    });
});
