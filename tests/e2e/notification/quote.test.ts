import { authRequest, parseBody, request } from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

interface NotificationItem {
    id: string;
    type: string;
    issuerId: string;
    // Both are Optional in the response schema, so the key is absent rather
    // than null on a notification that points at nothing.
    postId?: string;
    referenceId?: string;
    isRead: boolean;
}

/**
 * E2E tests for QUOTE notifications.
 *
 * Being quoted is a louder signal than a like: somebody has said something
 * about your post to their own followers. The notification leads to the
 * quote rather than to the post being quoted, because the recipient already
 * knows their own post.
 */
describe("QUOTE notifications", () => {
    const ts = Date.now();
    const author = {
        email: `nq-author-${ts}@test.com`,
        password: "password123",
        username: `nqa${ts}`,
    };
    const quoter = {
        email: `nq-quoter-${ts}@test.com`,
        password: "password123",
        username: `nqq${ts}`,
    };

    let authorToken = "";
    let quoterToken = "";
    let quoterId = "";
    let originalPostId = "";

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

    async function notificationsOf(token: string): Promise<NotificationItem[]> {
        const response = await authRequest(token, {
            method: "GET",
            url: "/notifications?page=1&limit=50",
        });
        return parseBody<{ data: NotificationItem[] }>(response).data;
    }

    async function unreadCountOf(token: string): Promise<number> {
        const response = await authRequest(token, {
            method: "GET",
            url: "/notifications/unread-count",
        });
        return parseBody<{ data: { count: number } }>(response).data.count;
    }

    async function createPost(
        token: string,
        payload: Record<string, unknown>,
    ): Promise<string> {
        const response = await authRequest(token, {
            method: "POST",
            url: "/posts",
            payload,
        });
        expect(response.statusCode).toBe(201);
        return parseBody<{ data: { id: string } }>(response).data.id;
    }

    /**
     * Registers an author and a quoter, and leaves the author with one post
     * for the quoter to point at.
     */
    beforeAll(async () => {
        await request({
            method: "POST",
            url: "/auth/register",
            payload: author,
        });
        const quoterRes = await request({
            method: "POST",
            url: "/auth/register",
            payload: quoter,
        });
        quoterId = parseBody<{ data: { id: string } }>(quoterRes).data.id;

        authorToken = await login(author);
        quoterToken = await login(quoter);

        originalPostId = await createPost(authorToken, {
            content: "A post worth quoting",
        });
    });

    it("should notify the author, pointing at the quote", async () => {
        const before = await unreadCountOf(authorToken);

        const quoteId = await createPost(quoterToken, {
            content: "Adding my two cents",
            quotedPostId: originalPostId,
        });

        const notifications = await notificationsOf(authorToken);
        const quoteNotification = notifications.find(
            (item) => item.type === "QUOTE" && item.postId === quoteId,
        );

        expect(quoteNotification).toBeDefined();
        expect(quoteNotification?.issuerId).toBe(quoterId);
        expect(quoteNotification?.referenceId).toBe(quoteId);
        expect(quoteNotification?.isRead).toBe(false);
        expect(await unreadCountOf(authorToken)).toBe(before + 1);
    });

    it("should not notify the quoter about their own quote", async () => {
        const notifications = await notificationsOf(quoterToken);

        expect(notifications.some((item) => item.type === "QUOTE")).toBe(false);
    });

    it("should stay silent when an account quotes itself", async () => {
        const before = await unreadCountOf(authorToken);

        await createPost(authorToken, {
            content: "Quoting myself",
            quotedPostId: originalPostId,
        });

        expect(await unreadCountOf(authorToken)).toBe(before);
    });

    it("should take the notification with the quote when it is deleted", async () => {
        // Notification.post cascades, so nothing has to clean this up by hand.
        const quoteId = await createPost(quoterToken, {
            content: "A quote that will not last",
            quotedPostId: originalPostId,
        });

        const notified = await notificationsOf(authorToken);
        expect(notified.some((item) => item.postId === quoteId)).toBe(true);

        const deleteRes = await authRequest(quoterToken, {
            method: "DELETE",
            url: `/posts/${quoteId}`,
        });
        expect(deleteRes.statusCode).toBe(204);

        const after = await notificationsOf(authorToken);
        expect(after.some((item) => item.postId === quoteId)).toBe(false);
    });
});
