import { authRequest, parseBody, request } from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * E2E tests for direct messaging.
 *
 * The path being pinned here is the one an open inbox lives or dies on: a
 * stranger's first message must land in a requests tab rather than in the
 * conversation list, and it must raise no unread badge until the recipient
 * accepts it. Everything after that - replies, read receipts, withdrawal - is
 * the ordinary thread behaviour that only exists once consent was given.
 */
describe("Direct messaging", () => {
    const ts = Date.now();
    const alice = {
        email: `dm-a-${ts}@test.com`,
        password: "password123",
        username: `dma${ts}`,
    };
    const bob = {
        email: `dm-b-${ts}@test.com`,
        password: "password123",
        username: `dmb${ts}`,
    };

    let aliceToken = "";
    let bobToken = "";
    let aliceId = "";
    let bobId = "";
    let conversationId = "";

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

    async function conversationIds(
        token: string,
        status: "ACCEPTED" | "PENDING",
    ): Promise<string[]> {
        const response = await authRequest(token, {
            method: "GET",
            url: `/conversations?status=${status}`,
        });
        return parseBody<{ data: { id: string }[] }>(response).data.map(
            (conversation) => conversation.id,
        );
    }

    async function unreadCount(token: string): Promise<number> {
        const response = await authRequest(token, {
            method: "GET",
            url: "/conversations/unread-count",
        });
        return parseBody<{ data: { count: number } }>(response).data.count;
    }

    beforeAll(async () => {
        aliceId = await register(alice);
        bobId = await register(bob);

        aliceToken = await login(alice);
        bobToken = await login(bob);
    });

    it("opens a conversation with a stranger as a pending request", async () => {
        const response = await authRequest(aliceToken, {
            method: "POST",
            url: "/conversations",
            payload: { recipientId: bobId },
        });

        expect(response.statusCode).toBe(201);

        const body = parseBody<{
            data: { id: string; status: string; canSend: boolean };
        }>(response);

        conversationId = body.data.id;

        expect(body.data.status).toBe("PENDING");
        expect(body.data.canSend).toBe(true);
    });

    it("returns the same conversation instead of opening a second one", async () => {
        const response = await authRequest(aliceToken, {
            method: "POST",
            url: "/conversations",
            payload: { recipientId: bobId },
        });

        // 200, not 201: nothing was created. A client keying a "conversation
        // started" toast off the status must not fire it for a thread that was
        // already there.
        expect(response.statusCode).toBe(200);
        expect(parseBody<{ data: { id: string } }>(response).data.id).toBe(
            conversationId,
        );
    });

    it("refuses a conversation with yourself", async () => {
        const response = await authRequest(aliceToken, {
            method: "POST",
            url: "/conversations",
            payload: { recipientId: aliceId },
        });

        expect(response.statusCode).toBe(400);
    });

    it("delivers the first message into the recipient's requests tab", async () => {
        const sent = await authRequest(aliceToken, {
            method: "POST",
            url: `/conversations/${conversationId}/messages`,
            payload: { content: "hi, can we talk?" },
        });

        expect(sent.statusCode).toBe(201);

        expect(await conversationIds(bobToken, "PENDING")).toContain(
            conversationId,
        );
        expect(await conversationIds(bobToken, "ACCEPTED")).not.toContain(
            conversationId,
        );
    });

    it("does not let a request raise the unread badge", async () => {
        // The counter itself moves - the message is unread - but the badge
        // only sums accepted conversations, so a stranger cannot demand
        // attention just by writing.
        expect(await unreadCount(bobToken)).toBe(0);
    });

    it("refuses to let the recipient reply before accepting", async () => {
        const response = await authRequest(bobToken, {
            method: "POST",
            url: `/conversations/${conversationId}/messages`,
            payload: { content: "who are you" },
        });

        expect(response.statusCode).toBe(403);
    });

    it("moves the conversation into the inbox once accepted", async () => {
        const response = await authRequest(bobToken, {
            method: "PATCH",
            url: `/conversations/${conversationId}/accept`,
        });

        expect(response.statusCode).toBe(200);
        expect(
            parseBody<{ data: { status: string } }>(response).data.status,
        ).toBe("ACCEPTED");

        expect(await conversationIds(bobToken, "ACCEPTED")).toContain(
            conversationId,
        );
    });

    it("counts the pending message towards the badge once accepted", async () => {
        expect(await unreadCount(bobToken)).toBe(1);
    });

    it("lets both sides write once accepted", async () => {
        const response = await authRequest(bobToken, {
            method: "POST",
            url: `/conversations/${conversationId}/messages`,
            payload: { content: "sure, go ahead" },
        });

        expect(response.statusCode).toBe(201);
        expect(await unreadCount(aliceToken)).toBe(1);
    });

    it("refuses a message with neither text nor media", async () => {
        const response = await authRequest(aliceToken, {
            method: "POST",
            url: `/conversations/${conversationId}/messages`,
            payload: { content: "   " },
        });

        expect(response.statusCode).toBe(400);
    });

    it("serves the thread newest message first", async () => {
        const response = await authRequest(bobToken, {
            method: "GET",
            url: `/conversations/${conversationId}/messages`,
        });

        const body = parseBody<{
            data: {
                conversation: { participant: { username: string } };
                messages: { content: string; isMine: boolean }[];
            };
        }>(response);

        expect(body.data.conversation.participant.username).toBe(
            alice.username,
        );
        expect(body.data.messages[0].content).toBe("sure, go ahead");
        expect(body.data.messages[0].isMine).toBe(true);
        expect(body.data.messages[1].content).toBe("hi, can we talk?");
        expect(body.data.messages[1].isMine).toBe(false);
    });

    it("clears the badge when the thread is marked read", async () => {
        const response = await authRequest(bobToken, {
            method: "PATCH",
            url: `/conversations/${conversationId}/read`,
        });

        expect(response.statusCode).toBe(204);
        expect(await unreadCount(bobToken)).toBe(0);
    });

    it("hides a thread from somebody who is not in it", async () => {
        const stranger = {
            email: `dm-c-${ts}@test.com`,
            password: "password123",
            username: `dmc${ts}`,
        };
        await register(stranger);
        const strangerToken = await login(stranger);

        const response = await authRequest(strangerToken, {
            method: "GET",
            url: `/conversations/${conversationId}/messages`,
        });

        expect(response.statusCode).toBe(404);
    });

    it("withdraws a message the sender wrote", async () => {
        const sent = await authRequest(aliceToken, {
            method: "POST",
            url: `/conversations/${conversationId}/messages`,
            payload: { content: "sent by mistake" },
        });
        const messageId = parseBody<{ data: { id: string } }>(sent).data.id;

        const deleted = await authRequest(aliceToken, {
            method: "DELETE",
            url: `/messages/${messageId}`,
        });

        expect(deleted.statusCode).toBe(204);

        const thread = await authRequest(bobToken, {
            method: "GET",
            url: `/conversations/${conversationId}/messages`,
        });
        const [newest] = parseBody<{
            data: { messages: { isDeleted: boolean; content: string }[] };
        }>(thread).data.messages;

        // The row survives so the thread keeps its shape, but the text does
        // not: it is retained for replies to hang off, not so it can be read
        // after it was taken back.
        expect(newest.isDeleted).toBe(true);
        expect(newest.content).toBe("");
    });

    it("refuses to let somebody withdraw a message they did not write", async () => {
        const sent = await authRequest(aliceToken, {
            method: "POST",
            url: `/conversations/${conversationId}/messages`,
            payload: { content: "mine, not yours" },
        });
        const messageId = parseBody<{ data: { id: string } }>(sent).data.id;

        const response = await authRequest(bobToken, {
            method: "DELETE",
            url: `/messages/${messageId}`,
        });

        expect(response.statusCode).toBe(403);
    });

    it("stops a declined conversation from being written to", async () => {
        const carol = {
            email: `dm-d-${ts}@test.com`,
            password: "password123",
            username: `dmd${ts}`,
        };
        const carolId = await register(carol);
        const carolToken = await login(carol);

        const opened = await authRequest(aliceToken, {
            method: "POST",
            url: "/conversations",
            payload: { recipientId: carolId },
        });
        const declinedId = parseBody<{ data: { id: string } }>(opened).data.id;

        await authRequest(carolToken, {
            method: "PATCH",
            url: `/conversations/${declinedId}/decline`,
        });

        const response = await authRequest(aliceToken, {
            method: "POST",
            url: `/conversations/${declinedId}/messages`,
            payload: { content: "let me back in" },
        });

        expect(response.statusCode).toBe(403);
    });
});
