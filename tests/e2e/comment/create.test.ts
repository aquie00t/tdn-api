import { authRequest, parseBody, request } from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

const FAKE_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * E2E tests for the Create Comment endpoint.
 * Validates top-level comment creation, nested reply creation,
 * and proper error handling for invalid inputs, unknown resources,
 * and unauthenticated requests.
 */
describe("POST /posts/:postId/comments - Create Comment", () => {
    const ts = Date.now();
    const user = {
        email: `cc-${ts}@test.com`,
        password: "password123",
        username: `cc${ts}`,
    };

    let accessToken = "";
    let postId = "";

    /**
     * Registers a test user, logs in to obtain an access token,
     * and creates a post to attach comments to throughout all tests.
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

        const postRes = await authRequest(accessToken, {
            method: "POST",
            url: "/posts",
            payload: { content: "E2E test post for comment creation" },
        });

        postId = parseBody<{ data: { id: string } }>(postRes).data.id;
    });

    it("should return 201 when creating a top-level comment", async () => {
        const response = await authRequest(accessToken, {
            method: "POST",
            url: `/posts/${postId}/comments`,
            payload: { content: "Top-level comment" },
        });
        const body = parseBody<{
            data: {
                id: string;
                content: string;
                postId: string;
                parentId: string | null;
                mediaUrls: string[];
                createdAt: string;
                likeCount: number;
                replyCount: number;
                isLiked: boolean;
                isBookmarked: boolean;
                author: {
                    id: string;
                    isMe: boolean;
                    username: string;
                };
            };
            meta: { timestamp: string };
        }>(response);

        expect(response.statusCode).toBe(201);
        expect(body.data.id).toEqual(expect.any(String));
        expect(body.data.content).toBe("Top-level comment");
        expect(body.data.postId).toBe(postId);
        expect(body.data.parentId).toBeNull();
        expect(body.data.mediaUrls).toEqual(expect.any(Array));
        expect(body.data.createdAt).toEqual(expect.any(String));
        expect(body.data.likeCount).toBe(0);
        expect(body.data.replyCount).toBe(0);
        expect(body.data.isLiked).toBe(false);
        expect(body.data.isBookmarked).toBe(false);
        expect(body.data.author.isMe).toBe(true);
        // The column is NOT NULL and the relation is required, so the schema
        // declares this required - it must never be omitted.
        expect(body.data.author.username).toBe(user.username);
        expect(body.meta).toHaveProperty("timestamp", expect.any(String));
    });

    it("should return 201 when creating a nested reply via parentId", async () => {
        // Create a parent comment first
        const parentRes = await authRequest(accessToken, {
            method: "POST",
            url: `/posts/${postId}/comments`,
            payload: { content: "Parent comment for reply test" },
        });
        const parentId = parseBody<{ data: { id: string } }>(parentRes).data.id;

        const response = await authRequest(accessToken, {
            method: "POST",
            url: `/posts/${postId}/comments`,
            payload: { content: "Nested reply", parentId },
        });
        const body = parseBody<{
            data: { id: string; parentId: string | null };
            meta: { timestamp: string };
        }>(response);

        expect(response.statusCode).toBe(201);
        expect(body.data.parentId).toBe(parentId);
        expect(body.meta).toHaveProperty("timestamp", expect.any(String));
    });

    it("should return 404 when the post does not exist", async () => {
        const response = await authRequest(accessToken, {
            method: "POST",
            url: `/posts/${FAKE_UUID}/comments`,
            payload: { content: "Comment on fake post" },
        });
        const body = parseBody<{ title: string; detail: string }>(response);

        expect(response.statusCode).toBe(404);
        expect(body.title).toBe("NotFoundError");
        expect(body.detail).toBe("Post not found.");
    });

    it("should return 404 when the parentId does not exist", async () => {
        const response = await authRequest(accessToken, {
            method: "POST",
            url: `/posts/${postId}/comments`,
            payload: { content: "Reply to ghost", parentId: FAKE_UUID },
        });
        const body = parseBody<{ title: string; detail: string }>(response);

        expect(response.statusCode).toBe(404);
        expect(body.title).toBe("NotFoundError");
        expect(body.detail).toBe("Parent comment not found.");
    });

    it("should return 400 when parentId belongs to a different post", async () => {
        // Create a second post and a comment on it
        const secondPostRes = await authRequest(accessToken, {
            method: "POST",
            url: "/posts",
            payload: { content: "Second post for cross-post parentId test" },
        });
        const secondPostId = parseBody<{ data: { id: string } }>(secondPostRes)
            .data.id;

        const commentOnSecondPostRes = await authRequest(accessToken, {
            method: "POST",
            url: `/posts/${secondPostId}/comments`,
            payload: { content: "Comment on second post" },
        });
        const crossPostCommentId = parseBody<{ data: { id: string } }>(
            commentOnSecondPostRes,
        ).data.id;

        // Try to use that comment as parentId on the first post
        const response = await authRequest(accessToken, {
            method: "POST",
            url: `/posts/${postId}/comments`,
            payload: {
                content: "Cross-post reply attempt",
                parentId: crossPostCommentId,
            },
        });
        const body = parseBody<{ title: string; detail: string }>(response);

        expect(response.statusCode).toBe(400);
        expect(body.title).toBe("BadRequestError");
        expect(body.detail).toBe("Parent comment belongs to a different post.");
    });

    it("should return 401 when not authenticated", async () => {
        const response = await request({
            method: "POST",
            url: `/posts/${postId}/comments`,
            payload: { content: "Unauthenticated comment" },
        });
        const body = parseBody<{ title: string }>(response);

        expect(response.statusCode).toBe(401);
        expect(body.title).toBe("UnauthorizedError");
    });

    it("should return 400 when content is missing", async () => {
        const response = await authRequest(accessToken, {
            method: "POST",
            url: `/posts/${postId}/comments`,
            payload: {},
        });

        expect(response.statusCode).toBe(400);
    });
});
