import { describe, it, expect, beforeAll } from "vitest";
import { request, authRequest, parseBody } from "../setup";

interface CommentData {
    id: string;
    content: string;
    postId: string | null;
    articleId: string | null;
    parentId: string | null;
    replyCount: number;
    likeCount: number;
    author: { id: string; isMe: boolean };
}

interface ArticleData {
    id: string;
    slug: string;
    commentCount: number;
}

type CommentEnvelope = { data: CommentData; meta: { timestamp: string } };
type CommentListEnvelope = {
    data: CommentData[];
    meta: { currentPage: number; limit: number };
};
type ArticleEnvelope = { data: ArticleData };
type ErrorEnvelope = { title: string; status: number };

const ts = Date.now();
const author = {
    email: `ac-author-${ts}@article-comments-test.com`,
    password: "password123",
    username: `aca${ts}`,
};
const reader = {
    email: `ac-reader-${ts}@article-comments-test.com`,
    password: "password123",
    username: `acr${ts}`,
};

let authorToken: string;
let readerToken: string;
let publishedId: string;
let publishedSlug: string;
let draftId: string;

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
 * Posts a comment on the published article as the reader.
 */
async function comment(
    content: string,
    parentId?: string,
): Promise<CommentData> {
    const response = await authRequest(readerToken, {
        method: "POST",
        url: `/articles/${publishedId}/comments`,
        payload: parentId ? { content, parentId } : { content },
    });
    return parseBody<CommentEnvelope>(response).data;
}

beforeAll(async () => {
    authorToken = await login(author);
    readerToken = await login(reader);

    const created = parseBody<ArticleEnvelope>(
        await authRequest(authorToken, {
            method: "POST",
            url: "/articles",
            payload: {
                title: `Commentable article ${ts}`,
                body: "Body prose for the comment tests.",
            },
        }),
    ).data;
    publishedId = created.id;
    publishedSlug = created.slug;

    await authRequest(authorToken, {
        method: "POST",
        url: `/articles/${publishedId}/publish`,
    });

    draftId = parseBody<ArticleEnvelope>(
        await authRequest(authorToken, {
            method: "POST",
            url: "/articles",
            payload: {
                title: `Draft article ${ts}`,
                body: "Body prose for the draft.",
            },
        }),
    ).data.id;
});

describe("POST /articles/:articleId/comments", () => {
    it("should create a comment attached to the article", async () => {
        const response = await authRequest(readerToken, {
            method: "POST",
            url: `/articles/${publishedId}/comments`,
            payload: { content: "First!" },
        });
        const body = parseBody<CommentEnvelope>(response);

        expect(response.statusCode).toBe(201);
        expect(body.data.articleId).toBe(publishedId);
        expect(body.data.postId).toBeNull();
        expect(body.data.parentId).toBeNull();
        expect(body.data.author.isMe).toBe(true);
    });

    it("should refuse a comment on a draft", async () => {
        const response = await authRequest(readerToken, {
            method: "POST",
            url: `/articles/${draftId}/comments`,
            payload: { content: "Sneaking in" },
        });

        expect(response.statusCode).toBe(404);
    });

    it("should refuse a comment on the author's own draft, even for the author", async () => {
        const response = await authRequest(authorToken, {
            method: "POST",
            url: `/articles/${draftId}/comments`,
            payload: { content: "Talking to myself" },
        });

        expect(response.statusCode).toBe(409);
        expect(parseBody<ErrorEnvelope>(response).title).toBe(
            "ArticleNotPublishedError",
        );
    });

    it("should reject a parent comment from a different thread", async () => {
        const other = parseBody<ArticleEnvelope>(
            await authRequest(authorToken, {
                method: "POST",
                url: "/articles",
                payload: {
                    title: `Other article ${ts}`,
                    body: "Another body.",
                },
            }),
        ).data;
        await authRequest(authorToken, {
            method: "POST",
            url: `/articles/${other.id}/publish`,
        });
        const foreign = parseBody<CommentEnvelope>(
            await authRequest(readerToken, {
                method: "POST",
                url: `/articles/${other.id}/comments`,
                payload: { content: "Elsewhere" },
            }),
        ).data;

        const response = await authRequest(readerToken, {
            method: "POST",
            url: `/articles/${publishedId}/comments`,
            payload: { content: "Wrong parent", parentId: foreign.id },
        });

        expect(response.statusCode).toBe(400);
    });

    it("should require authentication", async () => {
        const response = await request({
            method: "POST",
            url: `/articles/${publishedId}/comments`,
            payload: { content: "Anonymous" },
        });

        expect(response.statusCode).toBe(401);
    });

    it("should reject an unknown article", async () => {
        const response = await authRequest(readerToken, {
            method: "POST",
            url: "/articles/11111111-1111-4111-8111-111111111111/comments",
            payload: { content: "Nowhere" },
        });

        expect(response.statusCode).toBe(404);
    });
});

describe("nested replies through the existing comment routes", () => {
    it("should create a reply and expose it under the parent", async () => {
        const parent = await comment("Parent comment");
        const reply = await comment("A reply", parent.id);

        expect(reply.parentId).toBe(parent.id);
        expect(reply.articleId).toBe(publishedId);

        const replies = await request({
            method: "GET",
            url: `/comments/${parent.id}/replies`,
        });
        const body = parseBody<CommentListEnvelope>(replies);

        expect(replies.statusCode).toBe(200);
        expect(body.data.map((c) => c.id)).toContain(reply.id);
    });

    it("should serve an article comment from the shared comment detail route", async () => {
        const created = await comment("Readable through /comments");

        const response = await request({
            method: "GET",
            url: `/comments/${created.id}`,
        });
        const body = parseBody<CommentEnvelope>(response);

        expect(response.statusCode).toBe(200);
        expect(body.data.articleId).toBe(publishedId);
        expect(body.data.postId).toBeNull();
    });

    it("should like an article comment through the shared route", async () => {
        const created = await comment("Likeable");

        const response = await authRequest(authorToken, {
            method: "POST",
            url: `/comments/${created.id}/like`,
        });

        expect(response.statusCode).toBe(200);

        const detail = parseBody<CommentEnvelope>(
            await request({ method: "GET", url: `/comments/${created.id}` }),
        );
        expect(detail.data.likeCount).toBe(1);
    });

    it("should delete an article comment through the shared route", async () => {
        const created = await comment("Doomed");

        const response = await authRequest(readerToken, {
            method: "DELETE",
            url: `/comments/${created.id}`,
        });

        expect(response.statusCode).toBe(204);
        expect(
            (await request({ method: "GET", url: `/comments/${created.id}` }))
                .statusCode,
        ).toBe(404);
    });

    it("should not let another user delete a comment", async () => {
        const created = await comment("Not yours");

        const response = await authRequest(authorToken, {
            method: "DELETE",
            url: `/comments/${created.id}`,
        });

        expect(response.statusCode).toBe(403);
    });
});

describe("GET /articles/:articleId/comments", () => {
    it("should list only top-level comments", async () => {
        const parent = await comment("Top level for listing");
        const reply = await comment("Reply not in the list", parent.id);

        const response = await request({
            method: "GET",
            url: `/articles/${publishedId}/comments?limit=50`,
        });
        const ids = parseBody<CommentListEnvelope>(response).data.map(
            (c) => c.id,
        );

        expect(response.statusCode).toBe(200);
        expect(ids).toContain(parent.id);
        expect(ids).not.toContain(reply.id);
    });

    it("should be readable by a guest", async () => {
        const response = await request({
            method: "GET",
            url: `/articles/${publishedId}/comments`,
        });

        expect(response.statusCode).toBe(200);
        expect(parseBody<CommentListEnvelope>(response).meta).toEqual({
            currentPage: 1,
            limit: 10,
        });
    });

    it("should not expose the comments of someone else's draft", async () => {
        const response = await authRequest(readerToken, {
            method: "GET",
            url: `/articles/${draftId}/comments`,
        });

        expect(response.statusCode).toBe(404);
    });
});

describe("article comment count", () => {
    it("should be derived, and drop by the whole subtree when a parent is deleted", async () => {
        const fresh = parseBody<ArticleEnvelope>(
            await authRequest(authorToken, {
                method: "POST",
                url: "/articles",
                payload: {
                    title: `Counted article ${ts}`,
                    body: "Body prose.",
                },
            }),
        ).data;
        await authRequest(authorToken, {
            method: "POST",
            url: `/articles/${fresh.id}/publish`,
        });

        const parent = parseBody<CommentEnvelope>(
            await authRequest(readerToken, {
                method: "POST",
                url: `/articles/${fresh.id}/comments`,
                payload: { content: "Parent" },
            }),
        ).data;
        for (const content of ["Reply one", "Reply two"]) {
            await authRequest(readerToken, {
                method: "POST",
                url: `/articles/${fresh.id}/comments`,
                payload: { content, parentId: parent.id },
            });
        }

        const withComments = parseBody<ArticleEnvelope>(
            await request({ method: "GET", url: `/articles/${fresh.slug}` }),
        ).data;
        expect(withComments.commentCount).toBe(3);

        await authRequest(readerToken, {
            method: "DELETE",
            url: `/comments/${parent.id}`,
        });

        const afterDelete = parseBody<ArticleEnvelope>(
            await request({ method: "GET", url: `/articles/${fresh.slug}` }),
        ).data;

        // A denormalized counter would read 2 here, because the two replies are
        // removed by a database cascade the application never sees.
        expect(afterDelete.commentCount).toBe(0);
    });

    it("should count the comments on the published article", async () => {
        const response = await request({
            method: "GET",
            url: `/articles/${publishedSlug}`,
        });

        expect(
            parseBody<ArticleEnvelope>(response).data.commentCount,
        ).toBeGreaterThan(0);
    });
});
