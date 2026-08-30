import { authRequest, parseBody, request } from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

const FAKE_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * E2E tests for the DELETE /posts/:id endpoint.
 * Validates ownership enforcement, 404 handling, auth guard,
 * and successful deletion by the post owner.
 *
 * Test order is significant: ownership and 404 checks run before
 * the actual deletion so the post remains intact for those assertions.
 */
describe("DELETE /posts/:id - Delete Post", () => {
    const ts = Date.now();
    const userA = {
        email: `pd-a-${ts}@test.com`,
        password: "password123",
        username: `pda${ts}`,
    };
    const userB = {
        email: `pd-b-${ts}@test.com`,
        password: "password123",
        username: `pdb${ts}`,
    };

    let tokenA = "";
    let tokenB = "";
    let postId = "";

    /**
     * Registers two users, logs in as both, and has userA create a post
     * to be used as the deletion target throughout all tests.
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

        const postRes = await authRequest(tokenA, {
            method: "POST",
            url: "/posts",
            payload: { content: "E2E delete post target" },
        });
        postId = parseBody<{ data: { id: string } }>(postRes).data.id;
    });

    it("should return 403 when a non-owner tries to delete the post", async () => {
        const response = await authRequest(tokenB, {
            method: "DELETE",
            url: `/posts/${postId}`,
        });
        const body = parseBody<{ title: string; detail: string }>(response);

        expect(response.statusCode).toBe(403);
        expect(body.title).toBe("UnauthorizedActionError");
        expect(body.detail).toBe("You can only delete your own posts.");
    });

    it("should return 404 when the post does not exist", async () => {
        const response = await authRequest(tokenA, {
            method: "DELETE",
            url: `/posts/${FAKE_UUID}`,
        });
        const body = parseBody<{ title: string; detail: string }>(response);

        expect(response.statusCode).toBe(404);
        expect(body.title).toBe("NotFoundError");
        expect(body.detail).toBe("Post Not Found.");
    });

    it("should return 401 when not authenticated", async () => {
        const response = await request({
            method: "DELETE",
            url: `/posts/${postId}`,
        });
        const body = parseBody<{ title: string }>(response);

        expect(response.statusCode).toBe(401);
        expect(body.title).toBe("UnauthorizedError");
    });

    it("should return 204 when the post owner deletes their post", async () => {
        const response = await authRequest(tokenA, {
            method: "DELETE",
            url: `/posts/${postId}`,
        });

        expect(response.statusCode).toBe(204);
    });

    it("should give the quoted post its count back when the quote is deleted", async () => {
        const originalRes = await authRequest(tokenA, {
            method: "POST",
            url: "/posts",
            payload: { content: "Quote counter target" },
        });
        const originalId = parseBody<{ data: { id: string } }>(originalRes).data
            .id;

        const quoteRes = await authRequest(tokenA, {
            method: "POST",
            url: "/posts",
            payload: {
                content: "Quote to be deleted",
                quotedPostId: originalId,
            },
        });
        const quoteId = parseBody<{ data: { id: string } }>(quoteRes).data.id;

        const counted = await request({
            method: "GET",
            url: `/posts/${originalId}`,
        });
        expect(
            parseBody<{ data: { quoteCount: number } }>(counted).data
                .quoteCount,
        ).toBe(1);

        const deleteRes = await authRequest(tokenA, {
            method: "DELETE",
            url: `/posts/${quoteId}`,
        });
        expect(deleteRes.statusCode).toBe(204);

        const recounted = await request({
            method: "GET",
            url: `/posts/${originalId}`,
        });
        expect(
            parseBody<{ data: { quoteCount: number } }>(recounted).data
                .quoteCount,
        ).toBe(0);
    });
});
