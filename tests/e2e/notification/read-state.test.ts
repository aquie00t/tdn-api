import { authRequest, parseBody, request } from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * E2E tests for the notification read state endpoints:
 * GET /notifications/unread-count and PATCH /notifications/:id/read.
 *
 * Also covers the scoping guarantee both of them and read-all depend on:
 * a user can only ever read their own notifications.
 */
describe("Notification read state", () => {
    const ts = Date.now();
    const owner = {
        email: `ntf-rs-a-${ts}@test.com`,
        password: "password123",
        username: `ntfrsa${ts}`,
    };
    const follower = {
        email: `ntf-rs-b-${ts}@test.com`,
        password: "password123",
        username: `ntfrsb${ts}`,
    };
    const bystander = {
        email: `ntf-rs-c-${ts}@test.com`,
        password: "password123",
        username: `ntfrsc${ts}`,
    };

    let ownerToken = "";
    let ownerId = "";
    let followerToken = "";
    let followerId = "";
    let bystanderToken = "";

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

    async function unreadCount(token: string): Promise<number> {
        const response = await authRequest(token, {
            method: "GET",
            url: "/notifications/unread-count",
        });
        return parseBody<{ data: { count: number } }>(response).data.count;
    }

    async function newestNotificationId(token: string): Promise<string> {
        const response = await authRequest(token, {
            method: "GET",
            url: "/notifications?limit=1",
        });
        return parseBody<{ data: { id: string }[] }>(response).data[0].id;
    }

    /**
     * Leaves the owner with two unread notifications and the follower with
     * one, so a cross-user leak in either direction is visible.
     */
    beforeAll(async () => {
        ownerId = await register(owner);
        followerId = await register(follower);
        await register(bystander);

        ownerToken = await login(owner);
        followerToken = await login(follower);
        bystanderToken = await login(bystander);

        await authRequest(followerToken, {
            method: "POST",
            url: "/follows",
            payload: { targetId: ownerId },
        });
        await authRequest(bystanderToken, {
            method: "POST",
            url: "/follows",
            payload: { targetId: ownerId },
        });
        await authRequest(ownerToken, {
            method: "POST",
            url: "/follows",
            payload: { targetId: followerId },
        });
    });

    describe("GET /notifications/unread-count", () => {
        it("should count only the caller's unread notifications", async () => {
            expect(await unreadCount(ownerToken)).toBe(2);
            expect(await unreadCount(followerToken)).toBe(1);
        });

        it("should return 401 when not authenticated", async () => {
            const response = await request({
                method: "GET",
                url: "/notifications/unread-count",
            });

            expect(response.statusCode).toBe(401);
        });
    });

    describe("PATCH /notifications/:id/read", () => {
        it("should mark one notification as read and drop the count by one", async () => {
            const id = await newestNotificationId(ownerToken);

            const response = await authRequest(ownerToken, {
                method: "PATCH",
                url: `/notifications/${id}/read`,
            });

            expect(response.statusCode).toBe(204);
            expect(await unreadCount(ownerToken)).toBe(1);
        });

        it("should stay at 204 when the notification is already read", async () => {
            const id = await newestNotificationId(ownerToken);

            const response = await authRequest(ownerToken, {
                method: "PATCH",
                url: `/notifications/${id}/read`,
            });

            expect(response.statusCode).toBe(204);
            expect(await unreadCount(ownerToken)).toBe(1);
        });

        it("should answer 404 for a notification belonging to somebody else", async () => {
            const id = await newestNotificationId(ownerToken);

            const response = await authRequest(followerToken, {
                method: "PATCH",
                url: `/notifications/${id}/read`,
            });

            expect(response.statusCode).toBe(404);
            expect(await unreadCount(followerToken)).toBe(1);
        });

        it("should answer 404 for an unknown notification", async () => {
            const response = await authRequest(ownerToken, {
                method: "PATCH",
                url: "/notifications/00000000-0000-0000-0000-000000000000/read",
            });

            expect(response.statusCode).toBe(404);
        });

        it("should return 401 when not authenticated", async () => {
            const id = await newestNotificationId(ownerToken);

            const response = await request({
                method: "PATCH",
                url: `/notifications/${id}/read`,
            });

            expect(response.statusCode).toBe(401);
        });
    });

    describe("PATCH /notifications/read-all", () => {
        it("should clear only the caller's notifications", async () => {
            const response = await authRequest(ownerToken, {
                method: "PATCH",
                url: "/notifications/read-all",
            });

            expect(response.statusCode).toBe(200);
            expect(await unreadCount(ownerToken)).toBe(0);
            expect(await unreadCount(followerToken)).toBe(1);
        });
    });
});
