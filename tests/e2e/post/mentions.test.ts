import { authRequest, parseBody, request } from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

interface Mention {
    id: string;
    username: string;
}

/**
 * E2E tests for @mentions on posts and comments.
 *
 * Covers the write side only - what the API stores and serves back. The
 * notifications the same action raises are covered in
 * tests/e2e/notification/mention.test.ts.
 */
describe("Mentions on posts and comments", () => {
    const ts = Date.now();
    const author = {
        email: `mn-author-${ts}@test.com`,
        password: "password123",
        username: `mna${ts}`,
    };
    const mentioned = {
        email: `mn-target-${ts}@test.com`,
        password: "password123",
        username: `mnt${ts}`,
    };

    let authorToken = "";
    let mentionedId = "";

    async function login(user: {
        email: string;
        password: string;
    }): Promise<string> {
        const response = await request({
            method: "POST",
            url: "/auth/login",
            payload: { identifier: user.email, password: user.password },
        });
        return parseBody<{ data: { accessToken: string } }>(response).data
            .accessToken;
    }

    beforeAll(async () => {
        await request({
            method: "POST",
            url: "/auth/register",
            payload: author,
        });
        const mentionedRes = await request({
            method: "POST",
            url: "/auth/register",
            payload: mentioned,
        });
        mentionedId = parseBody<{ data: { id: string } }>(mentionedRes).data.id;

        authorToken = await login(author);
    });

    it("should resolve a handle in a post into an id and username pair", async () => {
        const response = await authRequest(authorToken, {
            method: "POST",
            url: "/posts",
            payload: { content: `hello @${mentioned.username}` },
        });

        expect(response.statusCode).toBe(201);
        const body = parseBody<{ data: { mentions: Mention[] } }>(response);
        expect(body.data.mentions).toEqual([
            { id: mentionedId, username: mentioned.username },
        ]);
    });

    it("should serve an empty list for a post that names nobody", async () => {
        const response = await authRequest(authorToken, {
            method: "POST",
            url: "/posts",
            payload: { content: "a post naming nobody" },
        });

        expect(
            parseBody<{ data: { mentions: Mention[] } }>(response).data
                .mentions,
        ).toEqual([]);
    });

    it("should resolve the same handle only once", async () => {
        const response = await authRequest(authorToken, {
            method: "POST",
            url: "/posts",
            payload: {
                content: `@${mentioned.username} and again @${mentioned.username}`,
            },
        });

        expect(
            parseBody<{ data: { mentions: Mention[] } }>(response).data
                .mentions,
        ).toHaveLength(1);
    });

    it("should drop a handle nobody owns without failing the write", async () => {
        const response = await authRequest(authorToken, {
            method: "POST",
            url: "/posts",
            payload: { content: `hi @nobody_owns_${ts}` },
        });

        expect(response.statusCode).toBe(201);
        expect(
            parseBody<{ data: { mentions: Mention[] } }>(response).data
                .mentions,
        ).toEqual([]);
    });

    it("should not read an email address as a mention", async () => {
        const response = await authRequest(authorToken, {
            method: "POST",
            url: "/posts",
            payload: { content: `write to ${mentioned.username}@test.com` },
        });

        expect(
            parseBody<{ data: { mentions: Mention[] } }>(response).data
                .mentions,
        ).toEqual([]);
    });

    it("should reject a post naming more than ten people", async () => {
        const body = Array.from(
            { length: 11 },
            (_, index) => `@mnbulk${ts}x${index}`,
        ).join(" ");

        const response = await authRequest(authorToken, {
            method: "POST",
            url: "/posts",
            payload: { content: body },
        });

        expect(response.statusCode).toBe(400);
    });

    it("should serve the mentions back when the post is read again", async () => {
        const created = await authRequest(authorToken, {
            method: "POST",
            url: "/posts",
            payload: { content: `reading back @${mentioned.username}` },
        });
        const postId = parseBody<{ data: { id: string } }>(created).data.id;

        const response = await authRequest(authorToken, {
            method: "GET",
            url: `/posts/${postId}`,
        });

        expect(
            parseBody<{ data: { mentions: Mention[] } }>(response).data
                .mentions,
        ).toEqual([{ id: mentionedId, username: mentioned.username }]);
    });

    it("should resolve a handle in a comment", async () => {
        const created = await authRequest(authorToken, {
            method: "POST",
            url: "/posts",
            payload: { content: "a post to comment on" },
        });
        const postId = parseBody<{ data: { id: string } }>(created).data.id;

        const response = await authRequest(authorToken, {
            method: "POST",
            url: `/posts/${postId}/comments`,
            payload: { content: `good point @${mentioned.username}` },
        });

        expect(response.statusCode).toBe(201);
        expect(
            parseBody<{ data: { mentions: Mention[] } }>(response).data
                .mentions,
        ).toEqual([{ id: mentionedId, username: mentioned.username }]);
    });
});
