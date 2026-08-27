import { authRequest, parseBody, request } from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * E2E tests for taking a notification back when its action is undone.
 *
 * Unliking or unfollowing must remove the notification it produced, so the
 * recipient is never left with a notification for something that no longer
 * happened, and toggling the action cannot pile up duplicates.
 */
describe("Notification cleanup on undo", () => {
    const ts = Date.now();
    const owner = {
        email: `ntf-cu-a-${ts}@test.com`,
        password: "password123",
        username: `ntfcua${ts}`,
    };
    const actor = {
        email: `ntf-cu-b-${ts}@test.com`,
        password: "password123",
        username: `ntfcub${ts}`,
    };

    let ownerToken = "";
    let ownerId = "";
    let actorToken = "";
    let postId = "";
    let ownerCommentId = "";

    async function register(user: {
        email: string;
        password: string;
        username: string;
    }): Promise<string> {
        const response = await request({
            method: "POST",
            url: "/auth/register",
            payload: user,
        });
        return parseBody<{ data: { id: string } }>(response).data.id;
    }

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

    async function notificationTypes(token: string): Promise<string[]> {
        const response = await authRequest(token, {
            method: "GET",
            url: "/notifications?limit=50",
        });
        return parseBody<{ data: { type: string }[] }>(response).data.map(
            (n) => n.type,
        );
    }

    async function unreadCount(token: string): Promise<number> {
        const response = await authRequest(token, {
            method: "GET",
            url: "/notifications/unread-count",
        });
        return parseBody<{ data: { count: number } }>(response).data.count;
    }

    beforeAll(async () => {
        ownerId = await register(owner);
        await register(actor);

        ownerToken = await login(owner);
        actorToken = await login(actor);

        const createdPost = await authRequest(ownerToken, {
            method: "POST",
            url: "/posts",
            payload: { content: "Undo cleanup target" },
        });
        postId = parseBody<{ data: { id: string } }>(createdPost).data.id;

        const ownerComment = await authRequest(ownerToken, {
            method: "POST",
            url: `/posts/${postId}/comments`,
            payload: { content: "Owner's own comment" },
        });
        ownerCommentId = parseBody<{ data: { id: string } }>(ownerComment).data
            .id;
    });

    it("should remove the like notification when the post is unliked", async () => {
        await authRequest(actorToken, {
            method: "POST",
            url: `/posts/${postId}/like`,
        });
        expect(await notificationTypes(ownerToken)).toContain("LIKE");

        await authRequest(actorToken, {
            method: "DELETE",
            url: `/posts/${postId}/unlike`,
        });

        expect(await notificationTypes(ownerToken)).not.toContain("LIKE");
    });

    it("should not stack duplicates when a like is toggled", async () => {
        for (let i = 0; i < 3; i++) {
            await authRequest(actorToken, {
                method: "POST",
                url: `/posts/${postId}/like`,
            });
            await authRequest(actorToken, {
                method: "DELETE",
                url: `/posts/${postId}/unlike`,
            });
        }

        await authRequest(actorToken, {
            method: "POST",
            url: `/posts/${postId}/like`,
        });

        const likes = (await notificationTypes(ownerToken)).filter(
            (type) => type === "LIKE",
        );
        expect(likes).toHaveLength(1);

        await authRequest(actorToken, {
            method: "DELETE",
            url: `/posts/${postId}/unlike`,
        });
    });

    it("should remove the comment like notification when the comment is unliked", async () => {
        await authRequest(actorToken, {
            method: "POST",
            url: `/comments/${ownerCommentId}/like`,
        });
        expect(await notificationTypes(ownerToken)).toContain("COMMENT_LIKE");

        await authRequest(actorToken, {
            method: "DELETE",
            url: `/comments/${ownerCommentId}/unlike`,
        });

        expect(await notificationTypes(ownerToken)).not.toContain(
            "COMMENT_LIKE",
        );
    });

    it("should remove the follow notification when the follow is undone", async () => {
        await authRequest(actorToken, {
            method: "POST",
            url: "/follows",
            payload: { targetId: ownerId },
        });
        expect(await notificationTypes(ownerToken)).toContain("FOLLOW");

        await authRequest(actorToken, {
            method: "DELETE",
            url: "/follows",
            payload: { targetId: ownerId },
        });

        expect(await notificationTypes(ownerToken)).not.toContain("FOLLOW");
    });

    it("should leave the owner with nothing unread once everything is undone", async () => {
        expect(await unreadCount(ownerToken)).toBe(0);
    });
});
