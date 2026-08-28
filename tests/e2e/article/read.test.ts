import { describe, it, expect, beforeAll } from "vitest";
import { request, authRequest, parseBody } from "../setup";

interface ArticleData {
    id: string;
    slug: string;
    title: string;
    status: string;
    publishedAt: string | null;
    tags: { name: string }[];
    author: { id: string; isMe: boolean; username: string };
}

type ArticleEnvelope = { data: ArticleData; meta: { timestamp: string } };
type ListEnvelope = {
    data: ArticleData[];
    meta: {
        total: number;
        currentPage: number;
        limit: number;
        totalPages: number;
    };
};
type ErrorEnvelope = { title: string; status: number };

const ts = Date.now();
const author = {
    email: `reader-author-${ts}@article-read-test.com`,
    password: "password123",
    username: `ra${ts}`,
};
const stranger = {
    email: `reader-stranger-${ts}@article-read-test.com`,
    password: "password123",
    username: `rs${ts}`,
};

let authorToken: string;
let strangerToken: string;

const readTag = `readtag${ts}`.slice(0, 30);

let draft: ArticleData;
let published: ArticleData;
let archived: ArticleData;

/**
 * Registers a user and returns their access token.
 */
async function login(user: {
    email: string;
    password: string;
    username: string;
}): Promise<string> {
    await request({ method: "POST", url: "/auth/register", payload: user });
    const response = await request({
        method: "POST",
        url: "/auth/login",
        payload: { identifier: user.email, password: user.password },
    });
    return parseBody<{ data: { accessToken: string } }>(response).data
        .accessToken;
}

/**
 * Creates a draft owned by the author.
 */
async function createDraft(
    title: string,
    extra: Record<string, unknown> = {},
): Promise<ArticleData> {
    const response = await authRequest(authorToken, {
        method: "POST",
        url: "/articles",
        payload: { title, body: "Body prose for the read tests.", ...extra },
    });
    return parseBody<ArticleEnvelope>(response).data;
}

beforeAll(async () => {
    authorToken = await login(author);
    strangerToken = await login(stranger);

    draft = await createDraft(`Draft piece ${ts}`);

    published = await createDraft(`Published piece ${ts}`, {
        tags: [readTag],
    });
    await authRequest(authorToken, {
        method: "POST",
        url: `/articles/${published.id}/publish`,
    });

    archived = await createDraft(`Archived piece ${ts}`);
    await authRequest(authorToken, {
        method: "POST",
        url: `/articles/${archived.id}/publish`,
    });
    await authRequest(authorToken, {
        method: "POST",
        url: `/articles/${archived.id}/archive`,
    });
});

describe("GET /articles", () => {
    it("should return published articles with pagination metadata", async () => {
        const response = await request({
            method: "GET",
            url: "/articles?limit=50",
        });
        const body = parseBody<ListEnvelope>(response);

        expect(response.statusCode).toBe(200);
        expect(body.meta).toEqual({
            total: expect.any(Number),
            currentPage: 1,
            limit: 50,
            totalPages: expect.any(Number),
        });
        expect(body.data.map((a) => a.id)).toContain(published.id);
    });

    it("should not carry the markdown body in list items", async () => {
        const response = await request({
            method: "GET",
            url: "/articles?limit=50",
        });
        const [first] = parseBody<ListEnvelope>(response).data;

        // A body can be 100 KB; a page of fifty would be megabytes no list
        // view renders. The summary keeps what a card needs instead.
        expect(first).toBeDefined();
        expect(first).not.toHaveProperty("body");
        expect(first).toHaveProperty("excerpt");
        expect(first).toHaveProperty("coverImageUrl");
        expect(first).toHaveProperty("readingTimeMinutes");
    });

    it("should never include drafts or archived articles", async () => {
        const response = await request({
            method: "GET",
            url: "/articles?limit=50",
        });
        const ids = parseBody<ListEnvelope>(response).data.map((a) => a.id);

        expect(ids).not.toContain(draft.id);
        expect(ids).not.toContain(archived.id);
    });

    it("should not leak the author's own drafts back to the author", async () => {
        const response = await authRequest(authorToken, {
            method: "GET",
            url: "/articles?limit=50",
        });
        const ids = parseBody<ListEnvelope>(response).data.map((a) => a.id);

        expect(ids).toContain(published.id);
        expect(ids).not.toContain(draft.id);
    });

    it("should filter by tag without exposing drafts", async () => {
        const response = await request({
            method: "GET",
            url: `/articles?tag=${readTag}`,
        });
        const ids = parseBody<ListEnvelope>(response).data.map((a) => a.id);

        expect(ids).not.toContain(draft.id);
    });

    it("should filter by author username", async () => {
        const response = await request({
            method: "GET",
            url: `/articles?authorUsername=${author.username}&limit=50`,
        });
        const body = parseBody<ListEnvelope>(response);

        expect(body.data.map((a) => a.id)).toContain(published.id);
        expect(body.data.every((a) => a.status === "PUBLISHED")).toBe(true);
    });

    it("should return an empty page for an unknown author", async () => {
        const response = await request({
            method: "GET",
            url: "/articles?authorUsername=nobody-here-at-all",
        });
        const body = parseBody<ListEnvelope>(response);

        expect(response.statusCode).toBe(200);
        expect(body.data).toEqual([]);
        expect(body.meta.total).toBe(0);
    });

    it("should require authentication for the followedOnly filter", async () => {
        const response = await request({
            method: "GET",
            url: "/articles?followedOnly=true",
        });

        expect(response.statusCode).toBe(401);
    });
});

describe("GET /articles/:slug", () => {
    it("should return a published article to a guest", async () => {
        const response = await request({
            method: "GET",
            url: `/articles/${published.slug}`,
        });
        const body = parseBody<ArticleEnvelope>(response);

        expect(response.statusCode).toBe(200);
        expect(body.data.id).toBe(published.id);
        expect(body.data.author.isMe).toBe(false);
        // The column is NOT NULL and the relation is required, so the schema
        // declares this required - it must never be omitted.
        expect(body.data.author.username).toBe(author.username);
    });

    it("should carry the full markdown body, unlike the list", async () => {
        const response = await request({
            method: "GET",
            url: `/articles/${published.slug}`,
        });
        const body = parseBody<{ data: { body: string } }>(response);

        expect(response.statusCode).toBe(200);
        expect(body.data).toHaveProperty("body");
        expect(typeof body.data.body).toBe("string");
        expect(body.data.body.length).toBeGreaterThan(0);
    });

    it("should hide a draft from a guest", async () => {
        const response = await request({
            method: "GET",
            url: `/articles/${draft.slug}`,
        });

        expect(response.statusCode).toBe(404);
        expect(parseBody<ErrorEnvelope>(response).title).toBe("NotFoundError");
    });

    it("should hide a draft from another authenticated user", async () => {
        const response = await authRequest(strangerToken, {
            method: "GET",
            url: `/articles/${draft.slug}`,
        });

        expect(response.statusCode).toBe(404);
    });

    it("should return the draft to its own author", async () => {
        const response = await authRequest(authorToken, {
            method: "GET",
            url: `/articles/${draft.slug}`,
        });
        const body = parseBody<ArticleEnvelope>(response);

        expect(response.statusCode).toBe(200);
        expect(body.data.status).toBe("DRAFT");
        expect(body.data.author.isMe).toBe(true);
    });

    it("should hide an archived article from everyone but its author", async () => {
        const asGuest = await request({
            method: "GET",
            url: `/articles/${archived.slug}`,
        });
        const asAuthor = await authRequest(authorToken, {
            method: "GET",
            url: `/articles/${archived.slug}`,
        });

        expect(asGuest.statusCode).toBe(404);
        expect(asAuthor.statusCode).toBe(200);
    });

    it("should answer 404 for an unknown slug, the same as for a draft", async () => {
        const unknown = await request({
            method: "GET",
            url: "/articles/no-such-article-00000000",
        });
        const draftResponse = await request({
            method: "GET",
            url: `/articles/${draft.slug}`,
        });

        expect(unknown.statusCode).toBe(draftResponse.statusCode);
        expect(parseBody<ErrorEnvelope>(unknown).title).toBe(
            parseBody<ErrorEnvelope>(draftResponse).title,
        );
    });

    it("should reject a slug that cannot have been generated", async () => {
        const response = await request({
            method: "GET",
            url: "/articles/Not_A_Valid_Slug",
        });

        expect(response.statusCode).toBe(400);
    });
});

describe("GET /articles/me", () => {
    it("should route to the author list rather than the slug lookup", async () => {
        const response = await request({ method: "GET", url: "/articles/me" });

        expect(response.statusCode).toBe(401);
    });

    it("should include the author's drafts and archived articles", async () => {
        const response = await authRequest(authorToken, {
            method: "GET",
            url: "/articles/me?limit=50",
        });
        const ids = parseBody<ListEnvelope>(response).data.map((a) => a.id);

        expect(response.statusCode).toBe(200);
        expect(ids).toContain(draft.id);
        expect(ids).toContain(published.id);
        expect(ids).toContain(archived.id);
    });

    it("should not carry the markdown body either", async () => {
        const response = await authRequest(authorToken, {
            method: "GET",
            url: "/articles/me?limit=50",
        });
        const [first] = parseBody<ListEnvelope>(response).data;

        expect(first).toBeDefined();
        expect(first).not.toHaveProperty("body");
    });

    it("should filter by status", async () => {
        const response = await authRequest(authorToken, {
            method: "GET",
            url: "/articles/me?status=DRAFT&limit=50",
        });
        const body = parseBody<ListEnvelope>(response);

        expect(body.data.every((a) => a.status === "DRAFT")).toBe(true);
        expect(body.data.map((a) => a.id)).toContain(draft.id);
    });

    it("should never return another user's articles", async () => {
        const response = await authRequest(strangerToken, {
            method: "GET",
            url: "/articles/me?limit=50",
        });
        const body = parseBody<ListEnvelope>(response);

        expect(body.data).toEqual([]);
        expect(body.meta.total).toBe(0);
    });
});

describe("cache isolation", () => {
    it("should not serve a cached guest page to an author, or the reverse", async () => {
        const guestFirst = await request({
            method: "GET",
            url: "/articles?limit=50",
        });
        const asAuthor = await authRequest(authorToken, {
            method: "GET",
            url: "/articles?limit=50",
        });
        const guestSecond = await request({
            method: "GET",
            url: "/articles?limit=50",
        });

        for (const response of [guestFirst, asAuthor, guestSecond]) {
            const ids = parseBody<ListEnvelope>(response).data.map((a) => a.id);
            expect(ids).not.toContain(draft.id);
            expect(ids).not.toContain(archived.id);
        }
    });

    it("should reflect a publish immediately, not after the cache expires", async () => {
        const fresh = await createDraft(`Cache check ${ts}`);

        const before = await request({
            method: "GET",
            url: "/articles?limit=50",
        });
        expect(
            parseBody<ListEnvelope>(before).data.map((a) => a.id),
        ).not.toContain(fresh.id);

        await authRequest(authorToken, {
            method: "POST",
            url: `/articles/${fresh.id}/publish`,
        });

        const after = await request({
            method: "GET",
            url: "/articles?limit=50",
        });
        expect(parseBody<ListEnvelope>(after).data.map((a) => a.id)).toContain(
            fresh.id,
        );
    });
});
