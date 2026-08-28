import { authRequest, parseBody, request } from "../setup";
import { BOT_USER } from "../test-constants";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * E2E tests for the POST /posts endpoint.
 * Validates that an authenticated user can create posts,
 * and that validation errors and auth guards behave correctly.
 */
describe("POST /posts - Create Post", () => {
    const ts = Date.now();
    const user = {
        email: `pc-${ts}@test.com`,
        password: "password123",
        username: `pc${ts}`,
    };

    let accessToken = "";

    /**
     * Registers a test user and logs in to obtain an access token.
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
    });

    it("should return 201 with post data when creating a text post", async () => {
        const response = await authRequest(accessToken, {
            method: "POST",
            url: "/posts",
            payload: { content: "E2E test post content" },
        });
        const body = parseBody<{
            data: {
                id: string;
                content: string;
                type: string;
                likeCount: number;
                commentCount: number;
                isLiked: boolean;
                isBookmarked: boolean;
                author: { isMe: boolean; username: string };
            };
            meta: { timestamp: string };
        }>(response);

        expect(response.statusCode).toBe(201);
        expect(body.data.id).toEqual(expect.any(String));
        expect(body.data.content).toBe("E2E test post content");
        expect(body.data.type).toBe("COMMUNITY");
        expect(body.data.likeCount).toBe(0);
        expect(body.data.commentCount).toBe(0);
        expect(body.data.isLiked).toBe(false);
        expect(body.data.isBookmarked).toBe(false);
        expect(body.data.author.isMe).toBe(true);
        // The column is NOT NULL and the relation is required, so the schema
        // declares this required - it must never be omitted.
        expect(body.data.author.username).toBe(user.username);
        expect(body.meta).toHaveProperty("timestamp", expect.any(String));
    });

    it("should return 201 with categories when creating a post with categories", async () => {
        const response = await authRequest(accessToken, {
            method: "POST",
            url: "/posts",
            payload: {
                content: "E2E categorized post",
                categories: ["BACKEND"],
            },
        });
        const body = parseBody<{
            data: { categories: { name: string }[] };
        }>(response);

        expect(response.statusCode).toBe(201);
        expect(body.data.categories).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: "BACKEND" }),
            ]),
        );
    });

    it("should return 400 when content exceeds 300 characters", async () => {
        const response = await authRequest(accessToken, {
            method: "POST",
            url: "/posts",
            payload: { content: "a".repeat(301) },
        });

        expect(response.statusCode).toBe(400);
    });

    it("should return 400 when content is an empty string", async () => {
        const response = await authRequest(accessToken, {
            method: "POST",
            url: "/posts",
            payload: { content: "" },
        });

        expect(response.statusCode).toBe(400);
    });

    it("should return 401 when not authenticated", async () => {
        const response = await request({
            method: "POST",
            url: "/posts",
            payload: { content: "Unauthorized post attempt" },
        });
        const body = parseBody<{ title: string }>(response);

        expect(response.statusCode).toBe(401);
        expect(body.title).toBe("UnauthorizedError");
    });

    describe("Bot user post type restrictions", () => {
        let botAccessToken = "";

        beforeAll(async () => {
            const loginRes = await request({
                method: "POST",
                url: "/auth/login",
                payload: {
                    identifier: BOT_USER.email,
                    password: BOT_USER.password,
                },
            });
            botAccessToken = parseBody<{ data: { accessToken: string } }>(
                loginRes,
            ).data.accessToken;
        });

        it("should return 403 when a normal user tries to create a SYSTEM_UPDATE post", async () => {
            const response = await authRequest(accessToken, {
                method: "POST",
                url: "/posts",
                payload: { content: "Restricted post", type: "SYSTEM_UPDATE" },
            });
            const body = parseBody<{ title: string }>(response);

            expect(response.statusCode).toBe(403);
            expect(body.title).toBe("ForbiddenError");
        });

        it("should return 201 when a bot user creates a SYSTEM_UPDATE post", async () => {
            const response = await authRequest(botAccessToken, {
                method: "POST",
                url: "/posts",
                payload: {
                    content: "Bot system update post",
                    type: "SYSTEM_UPDATE",
                },
            });

            expect(response.statusCode).toBe(201);
        });

        it("should return 201 when a bot user creates a TECH_NEWS post", async () => {
            const response = await authRequest(botAccessToken, {
                method: "POST",
                url: "/posts",
                payload: { content: "Bot tech news post", type: "TECH_NEWS" },
            });

            expect(response.statusCode).toBe(201);
        });
    });
});
