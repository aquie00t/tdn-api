import { describe, it, expect, beforeAll } from "vitest";
import { request, authRequest, parseBody } from "../setup";

interface ArticleData {
    id: string;
    slug: string;
    likeCount: number;
    isLiked: boolean;
    isBookmarked: boolean;
}

type ArticleEnvelope = { data: ArticleData };
type ListEnvelope = { data: ArticleData[]; meta: { total: number } };

const ts = Date.now();
const author = {
    email: `int-author-${ts}@article-interactions-test.com`,
    password: "password123",
    username: `ia${ts}`,
};
const reader = {
    email: `int-reader-${ts}@article-interactions-test.com`,
    password: "password123",
    username: `ir${ts}`,
};

let authorToken: string;
let readerToken: string;
let articleId: string;
let articleSlug: string;
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
 * Reads the article back as the given viewer.
 */
async function readArticle(token?: string): Promise<ArticleData> {
    const response = token
        ? await authRequest(token, {
              method: "GET",
              url: `/articles/${articleSlug}`,
          })
        : await request({ method: "GET", url: `/articles/${articleSlug}` });
    return parseBody<ArticleEnvelope>(response).data;
}

beforeAll(async () => {
    authorToken = await login(author);
    readerToken = await login(reader);

    const created = parseBody<ArticleEnvelope>(
        await authRequest(authorToken, {
            method: "POST",
            url: "/articles",
            payload: {
                title: `Interactive article ${ts}`,
                body: "Body prose for the interaction tests.",
            },
        }),
    ).data;
    articleId = created.id;
    articleSlug = created.slug;

    await authRequest(authorToken, {
        method: "POST",
        url: `/articles/${articleId}/publish`,
    });

    draftId = parseBody<ArticleEnvelope>(
        await authRequest(authorToken, {
            method: "POST",
            url: "/articles",
            payload: {
                title: `Draft for interactions ${ts}`,
                body: "Body prose.",
            },
        }),
    ).data.id;
});

describe("POST and DELETE /articles/:id/like", () => {
    it("should like an article and reflect it for that viewer only", async () => {
        const response = await authRequest(readerToken, {
            method: "POST",
            url: `/articles/${articleId}/like`,
        });

        expect(response.statusCode).toBe(200);

        const asReader = await readArticle(readerToken);
        const asGuest = await readArticle();

        expect(asReader.isLiked).toBe(true);
        expect(asReader.likeCount).toBe(1);
        expect(asGuest.isLiked).toBe(false);
        expect(asGuest.likeCount).toBe(1);
    });

    it("should be idempotent", async () => {
        await authRequest(readerToken, {
            method: "POST",
            url: `/articles/${articleId}/like`,
        });
        await authRequest(readerToken, {
            method: "POST",
            url: `/articles/${articleId}/like`,
        });

        expect((await readArticle(readerToken)).likeCount).toBe(1);
    });

    it("should remove the like", async () => {
        const response = await authRequest(readerToken, {
            method: "DELETE",
            url: `/articles/${articleId}/like`,
        });

        expect(response.statusCode).toBe(200);

        const after = await readArticle(readerToken);
        expect(after.isLiked).toBe(false);
        expect(after.likeCount).toBe(0);
    });

    it("should not drive the count negative when unliking twice", async () => {
        await authRequest(readerToken, {
            method: "DELETE",
            url: `/articles/${articleId}/like`,
        });

        expect((await readArticle()).likeCount).toBe(0);
    });

    it("should hide an unpublished article behind a 404", async () => {
        const response = await authRequest(readerToken, {
            method: "POST",
            url: `/articles/${draftId}/like`,
        });

        expect(response.statusCode).toBe(404);
    });

    it("should require authentication", async () => {
        const response = await request({
            method: "POST",
            url: `/articles/${articleId}/like`,
        });

        expect(response.statusCode).toBe(401);
    });
});

describe("POST and DELETE /articles/:id/bookmark", () => {
    it("should bookmark an article for that viewer only", async () => {
        const response = await authRequest(readerToken, {
            method: "POST",
            url: `/articles/${articleId}/bookmark`,
        });

        expect(response.statusCode).toBe(200);
        expect((await readArticle(readerToken)).isBookmarked).toBe(true);
        expect((await readArticle(authorToken)).isBookmarked).toBe(false);
    });

    it("should be idempotent", async () => {
        const response = await authRequest(readerToken, {
            method: "POST",
            url: `/articles/${articleId}/bookmark`,
        });

        expect(response.statusCode).toBe(200);
        expect((await readArticle(readerToken)).isBookmarked).toBe(true);
    });

    it("should remove the bookmark", async () => {
        const response = await authRequest(readerToken, {
            method: "DELETE",
            url: `/articles/${articleId}/bookmark`,
        });

        expect(response.statusCode).toBe(200);
        expect((await readArticle(readerToken)).isBookmarked).toBe(false);
    });

    it("should do nothing when removing a bookmark that was never made", async () => {
        const response = await authRequest(authorToken, {
            method: "DELETE",
            url: `/articles/${articleId}/bookmark`,
        });

        expect(response.statusCode).toBe(200);
    });

    it("should refuse to bookmark an unpublished article", async () => {
        const response = await authRequest(readerToken, {
            method: "POST",
            url: `/articles/${draftId}/bookmark`,
        });

        expect(response.statusCode).toBe(404);
    });
});

describe("tag trends with articles", () => {
    it("should count a published article's tag and ignore a draft's", async () => {
        const publishedTag = `trendpub${ts}`.slice(0, 30);
        const draftTag = `trenddraft${ts}`.slice(0, 30);

        const published = parseBody<ArticleEnvelope>(
            await authRequest(authorToken, {
                method: "POST",
                url: "/articles",
                payload: {
                    title: `Trending article ${ts}`,
                    body: "Body prose.",
                    tags: [publishedTag],
                },
            }),
        ).data;
        await authRequest(authorToken, {
            method: "POST",
            url: `/articles/${published.id}/publish`,
        });

        await authRequest(authorToken, {
            method: "POST",
            url: "/articles",
            payload: {
                title: `Draft trending article ${ts}`,
                body: "Body prose.",
                tags: [draftTag],
            },
        });

        const response = await request({
            method: "GET",
            url: "/tags/trends?limit=50",
        });
        const body = parseBody<{
            data: {
                trends: Array<{
                    tag: string;
                    postCount: number;
                    articleCount: number;
                }>;
            };
        }>(response);

        expect(response.statusCode).toBe(200);

        const entry = body.data.trends.find((t) => t.tag === publishedTag);
        expect(entry).toBeDefined();
        expect(entry?.articleCount).toBe(1);
        expect(entry?.postCount).toBe(0);

        expect(body.data.trends.map((t) => t.tag)).not.toContain(draftTag);
    });

    it("should expose articleCount from tag search", async () => {
        const searchTag = `searchpub${ts}`.slice(0, 30);

        const article = parseBody<ArticleEnvelope>(
            await authRequest(authorToken, {
                method: "POST",
                url: "/articles",
                payload: {
                    title: `Searchable article ${ts}`,
                    body: "Body prose.",
                    tags: [searchTag],
                },
            }),
        ).data;
        await authRequest(authorToken, {
            method: "POST",
            url: `/articles/${article.id}/publish`,
        });

        const response = await request({
            method: "GET",
            url: `/tags/search?q=${searchTag}`,
        });
        const body = parseBody<{
            data: Array<{ name: string; articleCount: number }>;
        }>(response);

        expect(response.statusCode).toBe(200);
        expect(body.data[0]?.name).toBe(searchTag);
        expect(body.data[0]?.articleCount).toBe(1);
    });
});

describe("bookmarked article listing", () => {
    it("should not expose bookmarks across users", async () => {
        await authRequest(readerToken, {
            method: "POST",
            url: `/articles/${articleId}/bookmark`,
        });

        const forReader = await authRequest(readerToken, {
            method: "GET",
            url: "/articles?limit=50",
        });
        const entry = parseBody<ListEnvelope>(forReader).data.find(
            (a) => a.id === articleId,
        );
        expect(entry?.isBookmarked).toBe(true);

        const forAuthor = await authRequest(authorToken, {
            method: "GET",
            url: "/articles?limit=50",
        });
        const sameForAuthor = parseBody<ListEnvelope>(forAuthor).data.find(
            (a) => a.id === articleId,
        );
        expect(sameForAuthor?.isBookmarked).toBe(false);
    });
});
