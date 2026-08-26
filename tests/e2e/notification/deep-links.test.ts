import { authRequest, parseBody, request } from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * E2E tests for the deep-link payload of GET /notifications.
 *
 * Every notification must carry enough to open what it is about without a
 * second round trip: the post or article, plus the comment when there is one.
 * A follow carries none of those and leads to the issuer's profile instead.
 */
describe("GET /notifications - deep-link targets", () => {
    const ts = Date.now();
    const author = {
        email: `ntf-dl-a-${ts}@test.com`,
        password: "password123",
        username: `ntfdla${ts}`,
    };
    const actor = {
        email: `ntf-dl-b-${ts}@test.com`,
        password: "password123",
        username: `ntfdlb${ts}`,
    };

    interface NotificationItem {
        id: string;
        type: string;
        referenceId?: string;
        postId?: string;
        articleId?: string;
        articleSlug?: string;
        commentId?: string;
        username?: string;
    }

    let authorToken = "";
    let actorToken = "";
    let postId = "";
    let authorCommentId = "";
    let actorCommentId = "";
    let notifications: NotificationItem[] = [];

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

    function findByType(type: string): NotificationItem | undefined {
        return notifications.find((n) => n.type === type);
    }

    /**
     * Drives one of each notification the author can receive on a post:
     * a like on the post, a comment on it, and a like on their own comment.
     */
    beforeAll(async () => {
        await request({
            method: "POST",
            url: "/auth/register",
            payload: author,
        });
        await request({
            method: "POST",
            url: "/auth/register",
            payload: actor,
        });

        authorToken = await login(author);
        actorToken = await login(actor);

        const createdPost = await authRequest(authorToken, {
            method: "POST",
            url: "/posts",
            payload: { content: "Deep-link notification target" },
        });
        postId = parseBody<{ data: { id: string } }>(createdPost).data.id;

        const authorComment = await authRequest(authorToken, {
            method: "POST",
            url: `/posts/${postId}/comments`,
            payload: { content: "Author's own comment" },
        });
        authorCommentId = parseBody<{ data: { id: string } }>(authorComment)
            .data.id;

        await authRequest(actorToken, {
            method: "POST",
            url: `/posts/${postId}/like`,
        });

        const actorComment = await authRequest(actorToken, {
            method: "POST",
            url: `/posts/${postId}/comments`,
            payload: { content: "Nice post" },
        });
        actorCommentId = parseBody<{ data: { id: string } }>(actorComment).data
            .id;

        await authRequest(actorToken, {
            method: "POST",
            url: `/comments/${authorCommentId}/like`,
        });

        const list = await authRequest(authorToken, {
            method: "GET",
            url: "/notifications?limit=50",
        });
        notifications = parseBody<{ data: NotificationItem[] }>(list).data;
    });

    it("should give every notification an addressable id", () => {
        expect(notifications.length).toBeGreaterThanOrEqual(3);
        for (const notification of notifications) {
            expect(notification.id).toEqual(expect.any(String));
        }
    });

    it("should point a post like at the liked post", () => {
        const like = findByType("LIKE");

        expect(like).toBeDefined();
        expect(like?.postId).toBe(postId);
        expect(like?.referenceId).toBe(postId);
        expect(like?.commentId).toBeUndefined();
        expect(like?.articleId).toBeUndefined();
    });

    it("should point a comment at both the comment and its post", () => {
        const comment = findByType("COMMENT");

        expect(comment).toBeDefined();
        expect(comment?.commentId).toBe(actorCommentId);
        expect(comment?.postId).toBe(postId);
        expect(comment?.referenceId).toBe(actorCommentId);
    });

    it("should point a comment like at the liked comment and its post", () => {
        const commentLike = findByType("COMMENT_LIKE");

        expect(commentLike).toBeDefined();
        expect(commentLike?.commentId).toBe(authorCommentId);
        expect(commentLike?.postId).toBe(postId);
        expect(commentLike?.referenceId).toBe(authorCommentId);
    });
});
