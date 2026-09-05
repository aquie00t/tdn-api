import { authRequest, parseBody, request } from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * E2E tests for the content report endpoint.
 *
 * The endpoint's whole contract is that it says almost nothing: the same
 * answer whether a report was just filed or already existed, and no way to
 * read the queue back. These cover that as much as the happy path, because a
 * chattier response is how this becomes a tool for measuring moderation from
 * the outside.
 */
describe("Content reporting", () => {
    const ts = Date.now();
    const author = {
        email: `rp-a-${ts}@test.com`,
        password: "password123",
        username: `rpa${ts}`,
    };
    const reporter = {
        email: `rp-b-${ts}@test.com`,
        password: "password123",
        username: `rpb${ts}`,
    };

    let authorToken = "";
    let reporterToken = "";
    let postId = "";
    let commentId = "";

    const registerAndLogin = async (user: {
        email: string;
        password: string;
        username: string;
    }): Promise<string> => {
        await request({
            method: "POST",
            url: "/auth/register",
            payload: user,
        });

        const loggedIn = await request({
            method: "POST",
            url: "/auth/login",
            payload: { identifier: user.email, password: user.password },
        });

        return parseBody<{ data: { accessToken: string } }>(loggedIn).data
            .accessToken;
    };

    beforeAll(async () => {
        authorToken = await registerAndLogin(author);
        reporterToken = await registerAndLogin(reporter);

        const post = await authRequest(authorToken, {
            method: "POST",
            url: "/posts",
            payload: { content: "something worth reporting" },
        });

        postId = parseBody<{ data: { id: string } }>(post).data.id;

        const comment = await authRequest(authorToken, {
            method: "POST",
            url: `/posts/${postId}/comments`,
            payload: { content: "and a comment under it" },
        });

        commentId = parseBody<{ data: { id: string } }>(comment).data.id;
    });

    it("should accept a report of a post", async () => {
        const response = await authRequest(reporterToken, {
            method: "POST",
            url: "/reports",
            payload: {
                targetKind: "POST",
                targetId: postId,
                reason: "SPAM",
                details: "links to a phishing page",
            },
        });

        expect(response.statusCode).toBe(200);
        expect(
            parseBody<{ data: { received: boolean } }>(response).data.received,
        ).toBe(true);
    });

    it("should answer a repeat report identically", async () => {
        const response = await authRequest(reporterToken, {
            method: "POST",
            url: "/reports",
            payload: {
                targetKind: "POST",
                targetId: postId,
                reason: "HARASSMENT",
            },
        });

        expect(response.statusCode).toBe(200);
        expect(
            parseBody<{ data: { received: boolean } }>(response).data.received,
        ).toBe(true);
    });

    it("should accept a report of a comment", async () => {
        const response = await authRequest(reporterToken, {
            method: "POST",
            url: "/reports",
            payload: {
                targetKind: "COMMENT",
                targetId: commentId,
                reason: "HATE",
            },
        });

        expect(response.statusCode).toBe(200);
    });

    it("should reject reporting your own content", async () => {
        const response = await authRequest(authorToken, {
            method: "POST",
            url: "/reports",
            payload: {
                targetKind: "POST",
                targetId: postId,
                reason: "SPAM",
            },
        });

        expect(response.statusCode).toBe(400);
    });

    it("should answer 404 for content that does not exist", async () => {
        const response = await authRequest(reporterToken, {
            method: "POST",
            url: "/reports",
            payload: {
                targetKind: "POST",
                targetId: "11111111-1111-4111-8111-111111111111",
                reason: "SPAM",
            },
        });

        expect(response.statusCode).toBe(404);
    });

    it("should reject a reason outside the enum", async () => {
        const response = await authRequest(reporterToken, {
            method: "POST",
            url: "/reports",
            payload: {
                targetKind: "POST",
                targetId: postId,
                reason: "I_JUST_DISAGREE",
            },
        });

        expect(response.statusCode).toBe(400);
    });

    it("should reject an unreportable target kind", async () => {
        const response = await authRequest(reporterToken, {
            method: "POST",
            url: "/reports",
            payload: {
                targetKind: "MESSAGE",
                targetId: postId,
                reason: "SPAM",
            },
        });

        expect(response.statusCode).toBe(400);
    });

    it("should reject details longer than the cap", async () => {
        const response = await authRequest(reporterToken, {
            method: "POST",
            url: "/reports",
            payload: {
                targetKind: "POST",
                targetId: postId,
                reason: "OTHER",
                details: "x".repeat(501),
            },
        });

        expect(response.statusCode).toBe(400);
    });

    it("should require a session", async () => {
        const response = await request({
            method: "POST",
            url: "/reports",
            payload: {
                targetKind: "POST",
                targetId: postId,
                reason: "SPAM",
            },
        });

        expect(response.statusCode).toBe(401);
    });
});
