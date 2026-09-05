import { authRequest, parseBody, request } from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * E2E tests for what a block does to a conversation that already exists.
 *
 * The thread is hidden from both inboxes rather than closed or deleted. It
 * keeps its row - deleting it would throw away a history neither side agreed
 * to lose - and comes back whole when the block is lifted.
 */
describe("Blocking and direct messages", () => {
    const ts = Date.now();
    const alice = {
        email: `blm-a-${ts}@test.com`,
        password: "password123",
        username: `blma${ts}`,
    };
    const bob = {
        email: `blm-b-${ts}@test.com`,
        password: "password123",
        username: `blmb${ts}`,
    };

    let aliceToken = "";
    let bobToken = "";
    let aliceId = "";
    let bobId = "";
    let conversationId = "";

    const registerAndLogin = async (user: {
        email: string;
        password: string;
        username: string;
    }): Promise<{ id: string; token: string }> => {
        const registered = await request({
            method: "POST",
            url: "/auth/register",
            payload: user,
        });
        const id = parseBody<{ data: { id: string } }>(registered).data.id;

        const loggedIn = await request({
            method: "POST",
            url: "/auth/login",
            payload: { identifier: user.email, password: user.password },
        });
        const token = parseBody<{ data: { accessToken: string } }>(loggedIn)
            .data.accessToken;

        return { id, token };
    };

    beforeAll(async () => {
        const a = await registerAndLogin(alice);
        const b = await registerAndLogin(bob);

        aliceId = a.id;
        aliceToken = a.token;
        bobId = b.id;
        bobToken = b.token;

        // Bob follows Alice, so her thread opens ACCEPTED rather than as a
        // request - this test is about blocking, not about the request tab.
        await authRequest(bobToken, {
            method: "POST",
            url: "/follows",
            payload: { targetId: aliceId },
        });

        const opened = await authRequest(aliceToken, {
            method: "POST",
            url: "/conversations",
            payload: { recipientId: bobId },
        });
        conversationId = parseBody<{ data: { id: string } }>(opened).data.id;

        await authRequest(aliceToken, {
            method: "POST",
            url: `/conversations/${conversationId}/messages`,
            payload: { content: "hello there" },
        });
    });

    it("shows the thread to both sides before the block", async () => {
        const forBob = await authRequest(bobToken, {
            method: "GET",
            url: "/conversations?status=ACCEPTED",
        });
        const body = parseBody<{ data: { id: string }[] }>(forBob);

        expect(body.data.map((row) => row.id)).toContain(conversationId);
    });

    describe("once blocked", () => {
        beforeAll(async () => {
            await authRequest(bobToken, {
                method: "POST",
                url: "/blocks",
                payload: { targetId: aliceId },
            });
        });

        it("drops the thread from the blocking user's inbox", async () => {
            const response = await authRequest(bobToken, {
                method: "GET",
                url: "/conversations?status=ACCEPTED",
            });
            const body = parseBody<{ data: { id: string }[] }>(response);

            expect(body.data.map((row) => row.id)).not.toContain(
                conversationId,
            );
        });

        it("drops it from the blocked user's inbox too", async () => {
            const response = await authRequest(aliceToken, {
                method: "GET",
                url: "/conversations?status=ACCEPTED",
            });
            const body = parseBody<{ data: { id: string }[] }>(response);

            // Symmetric: the blocked side loses the history as well, which is
            // the whole difference between blocking and muting.
            expect(body.data.map((row) => row.id)).not.toContain(
                conversationId,
            );
        });

        it("answers 404 when either side opens it", async () => {
            for (const token of [aliceToken, bobToken]) {
                const response = await authRequest(token, {
                    method: "GET",
                    url: `/conversations/${conversationId}/messages`,
                });

                expect(response.statusCode).toBe(404);
            }
        });

        it("refuses a message as if the thread were gone", async () => {
            const response = await authRequest(aliceToken, {
                method: "POST",
                url: `/conversations/${conversationId}/messages`,
                payload: { content: "are you there?" },
            });

            // 404 rather than "you cannot send here": the second answer would
            // confirm the thread is still standing.
            expect(response.statusCode).toBe(404);
        });

        it("keeps the hidden thread out of the unread badge", async () => {
            const response = await authRequest(bobToken, {
                method: "GET",
                url: "/conversations/unread-count",
            });
            const body = parseBody<{ data: { count: number } }>(response);

            // The reader has no way to open it and clear it, so it must not
            // keep the badge lit.
            expect(body.data.count).toBe(0);
        });
    });

    describe("once unblocked", () => {
        beforeAll(async () => {
            await authRequest(bobToken, {
                method: "DELETE",
                url: "/blocks",
                payload: { targetId: aliceId },
            });
        });

        it("brings the thread back to both inboxes", async () => {
            for (const token of [aliceToken, bobToken]) {
                const response = await authRequest(token, {
                    method: "GET",
                    url: "/conversations?status=ACCEPTED",
                });
                const body = parseBody<{ data: { id: string }[] }>(response);

                expect(body.data.map((row) => row.id)).toContain(
                    conversationId,
                );
            }
        });

        it("brings the history back with it", async () => {
            const response = await authRequest(bobToken, {
                method: "GET",
                url: `/conversations/${conversationId}/messages`,
            });
            const body = parseBody<{
                data: { messages: { content: string }[] };
            }>(response);

            expect(response.statusCode).toBe(200);
            expect(
                body.data.messages.map((message) => message.content),
            ).toContain("hello there");
        });

        it("lets messages flow again", async () => {
            const response = await authRequest(aliceToken, {
                method: "POST",
                url: `/conversations/${conversationId}/messages`,
                payload: { content: "good to be back" },
            });

            expect(response.statusCode).toBe(201);
        });
    });
});
