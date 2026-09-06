import { authRequest, parseBody, request } from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

interface PostData {
    id: string;
    content: string;
}

/**
 * E2E tests for retried writes.
 *
 * The behaviour being protected is a phone that loses the *response* to a
 * request and retries: the write must not happen twice, and the retry must be
 * told what the first attempt produced.
 */
describe("Idempotency-Key", () => {
    const ts = Date.now();
    const user = {
        email: `idem-${ts}@test.com`,
        password: "password123",
        username: `idem${ts}`,
    };
    const other = {
        email: `idem-b-${ts}@test.com`,
        password: "password123",
        username: `idemb${ts}`,
    };

    let token = "";
    let otherToken = "";

    const registerAndLogin = async (u: {
        email: string;
        password: string;
        username: string;
    }): Promise<string> => {
        await request({ method: "POST", url: "/auth/register", payload: u });

        const loggedIn = await request({
            method: "POST",
            url: "/auth/login",
            payload: { identifier: u.email, password: u.password },
        });

        return parseBody<{ data: { accessToken: string } }>(loggedIn).data
            .accessToken;
    };

    const createPost = (
        accessToken: string,
        content: string,
        key?: string,
    ) =>
        authRequest(accessToken, {
            method: "POST",
            url: "/posts",
            payload: { content },
            ...(key ? { headers: { "idempotency-key": key } } : {}),
        });

    beforeAll(async () => {
        token = await registerAndLogin(user);
        otherToken = await registerAndLogin(other);
    });

    it("should create the post once and replay the answer", async () => {
        const key = `key-${ts}-1`;

        const first = await createPost(token, "retried post", key);
        const retry = await createPost(token, "retried post", key);

        expect(first.statusCode).toBe(201);
        expect(retry.statusCode).toBe(201);

        const firstBody = parseBody<{ data: PostData }>(first).data;
        const retryBody = parseBody<{ data: PostData }>(retry).data;

        // The same post, not a second one that happens to look alike.
        expect(retryBody.id).toBe(firstBody.id);
        expect(retry.headers["idempotent-replay"]).toBe("true");
    });

    it("should refuse the same key with a different body", async () => {
        const key = `key-${ts}-2`;

        await createPost(token, "first body", key);
        const mismatch = await createPost(token, "different body", key);

        // A client bug, and answering it with the first request's result would
        // hide it behind a wrong response.
        expect(mismatch.statusCode).toBe(409);
    });

    it("should keep one account's key out of another's way", async () => {
        const key = `key-${ts}-3`;

        const mine = await createPost(token, "same key different people", key);
        const theirs = await createPost(
            otherToken,
            "same key different people",
            key,
        );

        expect(mine.statusCode).toBe(201);
        expect(theirs.statusCode).toBe(201);
        expect(parseBody<{ data: PostData }>(theirs).data.id).not.toBe(
            parseBody<{ data: PostData }>(mine).data.id,
        );
    });

    it("should create two posts when no key is sent", async () => {
        // The web client sends none, and its behaviour must not change.
        const first = await createPost(token, "unkeyed post");
        const second = await createPost(token, "unkeyed post");

        expect(parseBody<{ data: PostData }>(second).data.id).not.toBe(
            parseBody<{ data: PostData }>(first).data.id,
        );
    });

    it("should let a rejected request be retried with the same key", async () => {
        const key = `key-${ts}-4`;

        // An empty body fails validation; the key must not be spent on it.
        const rejected = await authRequest(token, {
            method: "POST",
            url: "/posts",
            payload: { content: "" },
            headers: { "idempotency-key": key },
        });

        expect(rejected.statusCode).toBe(400);

        const corrected = await createPost(token, "fixed after a 400", key);

        expect(corrected.statusCode).toBe(201);
    });
});
