import { describe, it, expect, beforeAll } from "vitest";
import { request, authRequest, parseBody } from "../setup";

interface ArticleData {
    id: string;
    slug: string;
    title: string;
    body: string;
    status: string;
    publishedAt: string | null;
    readingTimeMinutes: number;
    excerpt: string | null;
    coverImageUrl: string | null;
    tags: { name: string }[];
    author: { id: string; isMe: boolean };
}

type ArticleEnvelope = { data: ArticleData; meta: { timestamp: string } };
type ErrorEnvelope = { title: string; status: number; detail: string };

const ts = Date.now();
const author = {
    email: `author-${ts}@article-write-test.com`,
    password: "password123",
    username: `aw${ts}`,
};
const stranger = {
    email: `stranger-${ts}@article-write-test.com`,
    password: "password123",
    username: `sw${ts}`,
};

let authorToken: string;
let strangerToken: string;

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
 * Creates a draft article owned by the author and returns it.
 */
async function createDraft(
    overrides: Record<string, unknown> = {},
): Promise<ArticleData> {
    const response = await authRequest(authorToken, {
        method: "POST",
        url: "/articles",
        payload: {
            title: "An article about testing",
            body: "# Heading\n\nSome prose that is long enough to matter.",
            ...overrides,
        },
    });
    return parseBody<ArticleEnvelope>(response).data;
}

beforeAll(async () => {
    authorToken = await login(author);
    strangerToken = await login(stranger);
});

describe("POST /articles", () => {
    it("should create an article as a draft", async () => {
        const response = await authRequest(authorToken, {
            method: "POST",
            url: "/articles",
            payload: {
                title: "My first article",
                body: "Some prose for the body.",
                tags: ["testing"],
            },
        });
        const body = parseBody<ArticleEnvelope>(response);

        expect(response.statusCode).toBe(201);
        expect(body.data.status).toBe("DRAFT");
        expect(body.data.publishedAt).toBeNull();
        expect(body.data.author.id).toEqual(expect.any(String));
        expect(body.data.author.isMe).toBe(true);
        expect(body.data.tags).toEqual([{ name: "testing" }]);
        expect(body.meta).toHaveProperty("timestamp", expect.any(String));
    });

    it("should derive a slug with a random suffix", async () => {
        const first = await createDraft({ title: "Same Title Twice" });
        const second = await createDraft({ title: "Same Title Twice" });

        expect(first.slug).toMatch(/^same-title-twice-[0-9a-f]{8}$/);
        expect(second.slug).not.toBe(first.slug);
    });

    it("should store the markdown body unchanged", async () => {
        const markdown = '# Title\n\n<script>alert("xss")</script>\n\n- item';
        const article = await createDraft({ body: markdown });

        expect(article.body).toBe(markdown);
    });

    it("should derive reading time and excerpt", async () => {
        const article = await createDraft({
            body: Array(400).fill("word").join(" "),
        });

        expect(article.readingTimeMinutes).toBe(2);
        expect(article.excerpt).toContain("word");
    });

    it("should reject an empty title", async () => {
        const response = await authRequest(authorToken, {
            method: "POST",
            url: "/articles",
            payload: { title: "", body: "Some prose." },
        });

        expect(response.statusCode).toBe(400);
    });

    it("should reject a cover image key belonging to another user", async () => {
        const response = await authRequest(authorToken, {
            method: "POST",
            url: "/articles",
            payload: {
                title: "Stolen cover",
                body: "Some prose.",
                coverImageKey:
                    "articles/covers/00000000-0000-4000-8000-000000000000/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png",
            },
        });

        expect(response.statusCode).toBe(400);
        expect(parseBody<ErrorEnvelope>(response).title).toBe(
            "BadRequestError",
        );
    });

    it("should reject a body over the schema limit", async () => {
        const response = await authRequest(authorToken, {
            method: "POST",
            url: "/articles",
            payload: { title: "Too long", body: "a".repeat(100_001) },
        });

        expect(response.statusCode).toBe(400);
    });

    it("should reject a payload over the route body limit before parsing", async () => {
        const response = await authRequest(authorToken, {
            method: "POST",
            url: "/articles",
            payload: { title: "Huge", body: "a".repeat(300_000) },
        });

        expect(response.statusCode).toBe(413);
    });

    it("should require authentication", async () => {
        const response = await request({
            method: "POST",
            url: "/articles",
            payload: { title: "Anonymous", body: "Some prose." },
        });

        expect(response.statusCode).toBe(401);
    });
});

describe("PATCH /articles/:id", () => {
    it("should apply an edit without changing the slug", async () => {
        const draft = await createDraft({ title: "Before the edit" });

        const response = await authRequest(authorToken, {
            method: "PATCH",
            url: `/articles/${draft.id}`,
            payload: { title: "After the edit" },
        });
        const body = parseBody<ArticleEnvelope>(response);

        expect(response.statusCode).toBe(200);
        expect(body.data.title).toBe("After the edit");
        expect(body.data.slug).toBe(draft.slug);
    });

    it("should hide another user's draft behind a 404", async () => {
        const draft = await createDraft();

        const response = await authRequest(strangerToken, {
            method: "PATCH",
            url: `/articles/${draft.id}`,
            payload: { title: "Hijacked" },
        });

        expect(response.statusCode).toBe(404);
        expect(parseBody<ErrorEnvelope>(response).title).toBe("NotFoundError");
    });

    it("should forbid editing another user's published article", async () => {
        const draft = await createDraft();
        await authRequest(authorToken, {
            method: "POST",
            url: `/articles/${draft.id}/publish`,
        });

        const response = await authRequest(strangerToken, {
            method: "PATCH",
            url: `/articles/${draft.id}`,
            payload: { title: "Hijacked" },
        });

        expect(response.statusCode).toBe(403);
        expect(parseBody<ErrorEnvelope>(response).title).toBe(
            "UnauthorizedActionError",
        );
    });

    it("should reject a malformed tag", async () => {
        const draft = await createDraft();

        const response = await authRequest(authorToken, {
            method: "PATCH",
            url: `/articles/${draft.id}`,
            payload: { tags: ["not a tag"] },
        });

        expect(response.statusCode).toBe(400);
    });
});

describe("POST /articles/:id/publish and /archive", () => {
    it("should publish a draft and stamp the publication date", async () => {
        const draft = await createDraft();

        const response = await authRequest(authorToken, {
            method: "POST",
            url: `/articles/${draft.id}/publish`,
        });
        const body = parseBody<ArticleEnvelope>(response);

        expect(response.statusCode).toBe(200);
        expect(body.data.status).toBe("PUBLISHED");
        expect(body.data.publishedAt).toEqual(expect.any(String));
    });

    it("should reject publishing twice", async () => {
        const draft = await createDraft();
        await authRequest(authorToken, {
            method: "POST",
            url: `/articles/${draft.id}/publish`,
        });

        const response = await authRequest(authorToken, {
            method: "POST",
            url: `/articles/${draft.id}/publish`,
        });

        expect(response.statusCode).toBe(409);
        expect(parseBody<ErrorEnvelope>(response).title).toBe(
            "InvalidArticleStateError",
        );
    });

    it("should reject archiving a draft that was never published", async () => {
        const draft = await createDraft();

        const response = await authRequest(authorToken, {
            method: "POST",
            url: `/articles/${draft.id}/archive`,
        });

        expect(response.statusCode).toBe(409);
    });

    it("should archive a published article", async () => {
        const draft = await createDraft();
        await authRequest(authorToken, {
            method: "POST",
            url: `/articles/${draft.id}/publish`,
        });

        const response = await authRequest(authorToken, {
            method: "POST",
            url: `/articles/${draft.id}/archive`,
        });

        expect(response.statusCode).toBe(200);
        expect(parseBody<ArticleEnvelope>(response).data.status).toBe(
            "ARCHIVED",
        );
    });

    it("should keep the original publication date when re-published", async () => {
        const draft = await createDraft();
        const published = parseBody<ArticleEnvelope>(
            await authRequest(authorToken, {
                method: "POST",
                url: `/articles/${draft.id}/publish`,
            }),
        ).data;

        await authRequest(authorToken, {
            method: "POST",
            url: `/articles/${draft.id}/archive`,
        });
        const republished = parseBody<ArticleEnvelope>(
            await authRequest(authorToken, {
                method: "POST",
                url: `/articles/${draft.id}/publish`,
            }),
        ).data;

        expect(republished.publishedAt).toBe(published.publishedAt);
    });
});

describe("DELETE /articles/:id", () => {
    it("should delete an article the caller owns", async () => {
        const draft = await createDraft();

        const response = await authRequest(authorToken, {
            method: "DELETE",
            url: `/articles/${draft.id}`,
        });

        expect(response.statusCode).toBe(204);

        const second = await authRequest(authorToken, {
            method: "DELETE",
            url: `/articles/${draft.id}`,
        });
        expect(second.statusCode).toBe(404);
    });

    it("should hide another user's draft behind a 404", async () => {
        const draft = await createDraft();

        const response = await authRequest(strangerToken, {
            method: "DELETE",
            url: `/articles/${draft.id}`,
        });

        expect(response.statusCode).toBe(404);
    });

    it("should reject an identifier that is not a uuid", async () => {
        const response = await authRequest(authorToken, {
            method: "DELETE",
            url: "/articles/not-a-uuid",
        });

        expect(response.statusCode).toBe(400);
    });
});
