import { authRequest, parseBody, request } from "../setup";
import { BOT_USER } from "../test-constants";
import { beforeAll, describe, expect, it } from "vitest";

interface NotificationItem {
    id: string;
    type: string;
    // Both are Optional in the response schema, so the key is absent rather
    // than null on a notification that points at nothing.
    postId?: string;
    referenceId?: string;
    isRead: boolean;
}

/**
 * E2E tests for NEW_POST notifications.
 *
 * Following a news bot is only useful if its releases reach you: a user who
 * follows the TypeScript bot should hear about a TypeScript release without
 * having to go looking for it. Community posts stay silent, so the persona
 * accounts that keep the feed alive cannot drown that signal.
 */
describe("NEW_POST notifications", () => {
    const ts = Date.now();
    const follower = {
        email: `np-follower-${ts}@test.com`,
        password: "password123",
        username: `npf${ts}`,
    };
    const stranger = {
        email: `np-stranger-${ts}@test.com`,
        password: "password123",
        username: `nps${ts}`,
    };

    let followerToken = "";
    let strangerToken = "";
    let botUserId = "";
    let techNewsPostId = "";

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

    /**
     * Registers two users, has one of them follow the seeded bot, and leaves
     * the other unrelated so the fan-out can be shown to be targeted.
     */
    beforeAll(async () => {
        await Promise.all([
            request({
                method: "POST",
                url: "/auth/register",
                payload: follower,
            }),
            request({
                method: "POST",
                url: "/auth/register",
                payload: stranger,
            }),
        ]);

        [followerToken, strangerToken] = await Promise.all([
            login(follower),
            login(stranger),
        ]);

        const botProfile = await request({
            method: "GET",
            url: `/profiles/${BOT_USER.username}`,
        });
        botUserId = parseBody<{ data: { id: string } }>(botProfile).data.id;

        const followRes = await authRequest(followerToken, {
            method: "POST",
            url: "/follows",
            payload: { targetId: botUserId },
        });
        expect(followRes.statusCode).toBe(200);
    });

    it("should notify a follower when the bot publishes TECH_NEWS", async () => {
        const before = await unreadCountOf(followerToken);

        const postRes = await request({
            method: "POST",
            url: "/posts",
            headers: { authorization: `Bot ${BOT_USER.plainToken}` },
            payload: {
                content: "TypeScript 6.0 has been released",
                type: "TECH_NEWS",
            },
        });
        expect(postRes.statusCode).toBe(201);
        techNewsPostId = parseBody<{ data: { id: string } }>(postRes).data.id;

        await expect
            .poll(async () => {
                const items = await notificationsOf(followerToken);
                return items.some(
                    (n) =>
                        n.type === "NEW_POST" && n.postId === techNewsPostId,
                );
            })
            .toBe(true);

        expect(await unreadCountOf(followerToken)).toBe(before + 1);
    });

    it("should point the notification at the post", async () => {
        const items = await notificationsOf(followerToken);
        const notification = items.find(
            (n) => n.type === "NEW_POST" && n.postId === techNewsPostId,
        );

        expect(notification).toBeDefined();
        expect(notification!.referenceId).toBe(techNewsPostId);
        expect(notification!.isRead).toBe(false);
    });

    it("should not notify a user who does not follow the bot", async () => {
        const items = await notificationsOf(strangerToken);

        expect(items.some((n) => n.type === "NEW_POST")).toBe(false);
    });

    it("should stay silent for a COMMUNITY post", async () => {
        const before = await notificationsOf(followerToken);

        const postRes = await request({
            method: "POST",
            url: "/posts",
            headers: { authorization: `Bot ${BOT_USER.plainToken}` },
            payload: { content: "just chatting", type: "COMMUNITY" },
        });
        expect(postRes.statusCode).toBe(201);
        const communityPostId = parseBody<{ data: { id: string } }>(postRes)
            .data.id;

        const after = await notificationsOf(followerToken);

        expect(after.some((n) => n.postId === communityPostId)).toBe(false);
        expect(after).toHaveLength(before.length);
    });
});
