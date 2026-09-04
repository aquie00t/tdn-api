import { authRequest, parseBody, request } from "../setup";
import { BOT_USER } from "../test-constants";
import { beforeAll, describe, expect, it } from "vitest";

interface NotificationItem {
    id: string;
    type: string;
    issuerId: string;
    postId?: string;
    commentId?: string;
    referenceId?: string;
    isRead: boolean;
}

/**
 * E2E tests for MENTION notifications.
 *
 * The three rules the feature promises are all visible from here: naming
 * yourself is silent, naming somebody twice is one row, and somebody the same
 * action already notified does not also get a mention.
 */
describe("MENTION notifications", () => {
    const ts = Date.now();
    const author = {
        email: `nm-author-${ts}@test.com`,
        password: "password123",
        username: `nma${ts}`,
    };
    const mentioned = {
        email: `nm-target-${ts}@test.com`,
        password: "password123",
        username: `nmt${ts}`,
    };

    let authorToken = "";
    let mentionedToken = "";
    let authorId = "";

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

    async function createPost(token: string, content: string): Promise<string> {
        const response = await authRequest(token, {
            method: "POST",
            url: "/posts",
            payload: { content },
        });
        expect(response.statusCode).toBe(201);
        return parseBody<{ data: { id: string } }>(response).data.id;
    }

    beforeAll(async () => {
        const authorRes = await request({
            method: "POST",
            url: "/auth/register",
            payload: author,
        });
        authorId = parseBody<{ data: { id: string } }>(authorRes).data.id;

        await request({
            method: "POST",
            url: "/auth/register",
            payload: mentioned,
        });

        authorToken = await login(author);
        mentionedToken = await login(mentioned);
    });

    it("should notify the person named in a post", async () => {
        const postId = await createPost(
            authorToken,
            `you should see this @${mentioned.username}`,
        );

        // Written fire-and-forget, after the create response is already sent.
        await expect
            .poll(async () => {
                const items = await notificationsOf(mentionedToken);
                return items.some(
                    (item) => item.type === "MENTION" && item.postId === postId,
                );
            })
            .toBe(true);

        const notification = (await notificationsOf(mentionedToken)).find(
            (item) => item.type === "MENTION" && item.postId === postId,
        );

        expect(notification?.issuerId).toBe(authorId);
        expect(notification?.referenceId).toBe(postId);
        expect(notification?.isRead).toBe(false);
    });

    it("should write one row for a person named twice in the same post", async () => {
        const postId = await createPost(
            authorToken,
            `@${mentioned.username} and again @${mentioned.username}`,
        );

        await expect
            .poll(async () => {
                const items = await notificationsOf(mentionedToken);
                return items.filter(
                    (item) => item.type === "MENTION" && item.postId === postId,
                ).length;
            })
            .toBe(1);
    });

    it("should not notify an author who names themselves", async () => {
        const postId = await createPost(
            authorToken,
            `talking to myself @${author.username}`,
        );

        const items = await notificationsOf(authorToken);
        expect(
            items.some(
                (item) => item.type === "MENTION" && item.postId === postId,
            ),
        ).toBe(false);
    });

    it("should notify the person named in a comment, pointing at the comment", async () => {
        const postId = await createPost(authorToken, "a post to comment on");

        const response = await authRequest(authorToken, {
            method: "POST",
            url: `/posts/${postId}/comments`,
            payload: { content: `what do you think @${mentioned.username}` },
        });
        const commentId = parseBody<{ data: { id: string } }>(response).data.id;

        await expect
            .poll(async () => {
                const items = await notificationsOf(mentionedToken);
                return items.some(
                    (item) =>
                        item.type === "MENTION" && item.commentId === commentId,
                );
            })
            .toBe(true);

        const notification = (await notificationsOf(mentionedToken)).find(
            (item) => item.type === "MENTION" && item.commentId === commentId,
        );

        expect(notification?.postId).toBe(postId);
        expect(notification?.referenceId).toBe(commentId);
    });

    it("should send only COMMENT when the commenter names the post author", async () => {
        // The post author already hears about the comment; being named in the
        // same body must not add a second row.
        const postId = await createPost(
            mentionedToken,
            "my post, about to be answered",
        );

        const response = await authRequest(authorToken, {
            method: "POST",
            url: `/posts/${postId}/comments`,
            payload: { content: `agreed @${mentioned.username}` },
        });
        const commentId = parseBody<{ data: { id: string } }>(response).data.id;

        await expect
            .poll(async () => {
                const items = await notificationsOf(mentionedToken);
                return items.some(
                    (item) =>
                        item.type === "COMMENT" && item.commentId === commentId,
                );
            })
            .toBe(true);

        const items = await notificationsOf(mentionedToken);
        expect(
            items.some(
                (item) =>
                    item.type === "MENTION" && item.commentId === commentId,
            ),
        ).toBe(false);
    });

    it("should not raise a notification for a handle nobody owns", async () => {
        const before = (await notificationsOf(mentionedToken)).length;

        await createPost(authorToken, `hi @nobody_owns_${ts}`);

        expect((await notificationsOf(mentionedToken)).length).toBe(before);
    });
    describe("against the follower fan-out", () => {
        const botFollower = {
            email: `nm-follower-${ts}@test.com`,
            password: "password123",
            username: `nmf${ts}`,
        };

        let botFollowerToken = "";

        beforeAll(async () => {
            await request({
                method: "POST",
                url: "/auth/register",
                payload: botFollower,
            });
            botFollowerToken = await login(botFollower);

            const botProfile = await request({
                method: "GET",
                url: `/profiles/${BOT_USER.username}`,
            });
            const botUserId = parseBody<{ data: { id: string } }>(botProfile)
                .data.id;

            const followRes = await authRequest(botFollowerToken, {
                method: "POST",
                url: "/follows",
                payload: { targetId: botUserId },
            });
            expect(followRes.statusCode).toBe(200);
        });

        it("should send MENTION and not NEW_POST to a follower the bot names", async () => {
            // Both fan-outs would otherwise reach this person for one post.
            // The mention is the more specific signal, so it is the one kept.
            const postRes = await request({
                method: "POST",
                url: "/posts",
                headers: { authorization: `Bot ${BOT_USER.plainToken}` },
                payload: {
                    content: `Shipping today, thanks @${botFollower.username}`,
                    type: "TECH_NEWS",
                },
            });
            expect(postRes.statusCode).toBe(201);
            const postId = parseBody<{ data: { id: string } }>(postRes).data.id;

            await expect
                .poll(async () => {
                    const items = await notificationsOf(botFollowerToken);
                    return items.some(
                        (item) =>
                            item.type === "MENTION" && item.postId === postId,
                    );
                })
                .toBe(true);

            const items = await notificationsOf(botFollowerToken);
            expect(items.filter((item) => item.postId === postId)).toHaveLength(
                1,
            );
            expect(
                items.some(
                    (item) =>
                        item.type === "NEW_POST" && item.postId === postId,
                ),
            ).toBe(false);
        });

        it("should still send NEW_POST to a follower the bot does not name", async () => {
            const postRes = await request({
                method: "POST",
                url: "/posts",
                headers: { authorization: `Bot ${BOT_USER.plainToken}` },
                payload: {
                    content: "A release naming nobody in particular",
                    type: "TECH_NEWS",
                },
            });
            const postId = parseBody<{ data: { id: string } }>(postRes).data.id;

            await expect
                .poll(async () => {
                    const items = await notificationsOf(botFollowerToken);
                    return items.some(
                        (item) =>
                            item.type === "NEW_POST" && item.postId === postId,
                    );
                })
                .toBe(true);
        });
    });
});
