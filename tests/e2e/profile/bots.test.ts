import { authRequest, parseBody, request } from "../setup";
import { BOT_USER } from "../test-constants";
import { beforeAll, describe, expect, it } from "vitest";

interface BotProfileItem {
    userId: string;
    username: string;
    fullName: string;
    avatarUrl: string;
    bannerUrl: string;
    bio: string | null;
    categories: string[];
    followersCount: number;
    isFollowing: boolean;
}

interface BotProfilesBody {
    data: BotProfileItem[];
    meta: { timestamp: string; limit: number; offset: number; count: number };
}

/**
 * E2E tests for GET /profiles/bots and the bot-only `categories` field on
 * PATCH /profiles/me.
 *
 * The onboarding flow depends on this listing returning bot accounts only:
 * a human account must never appear here.
 */
describe("GET /profiles/bots - Bot discovery by category", () => {
    const ts = Date.now();
    const human = {
        email: `bots-${ts}@test.com`,
        password: "password123",
        username: `bots${ts}`,
    };

    let humanAccessToken = "";

    /**
     * Registers a human user and tags the seeded bot with categories.
     */
    beforeAll(async () => {
        await request({
            method: "POST",
            url: "/auth/register",
            payload: human,
        });

        const loginRes = await request({
            method: "POST",
            url: "/auth/login",
            payload: { identifier: human.email, password: human.password },
        });

        humanAccessToken = parseBody<{ data: { accessToken: string } }>(
            loginRes,
        ).data.accessToken;

        const patchRes = await request({
            method: "PATCH",
            url: "/profiles/me",
            headers: { authorization: `Bot ${BOT_USER.plainToken}` },
            payload: { categories: ["BACKEND", "AI"] },
        });

        expect(patchRes.statusCode).toBe(204);
    });

    it("should reject a non-bot account setting categories with 403", async () => {
        const response = await authRequest(humanAccessToken, {
            method: "PATCH",
            url: "/profiles/me",
            payload: { categories: ["BACKEND"] },
        });

        expect(response.statusCode).toBe(403);
    });

    it("should return 200 with the seeded bot when filtering by BACKEND", async () => {
        const response = await request({
            method: "GET",
            url: "/profiles/bots?categories=BACKEND",
        });
        const body = parseBody<BotProfilesBody>(response);

        expect(response.statusCode).toBe(200);
        expect(Array.isArray(body.data)).toBe(true);

        const bot = body.data.find((i) => i.username === BOT_USER.username);
        expect(bot).toBeDefined();
        expect(bot!.categories).toEqual(
            expect.arrayContaining(["BACKEND", "AI"]),
        );
    });

    it("should never include non-bot accounts", async () => {
        const response = await request({
            method: "GET",
            url: "/profiles/bots?limit=50",
        });
        const body = parseBody<BotProfilesBody>(response);

        expect(response.statusCode).toBe(200);
        expect(body.data.some((i) => i.username === human.username)).toBe(
            false,
        );
    });

    it("should exclude bots that do not carry the requested category", async () => {
        const response = await request({
            method: "GET",
            url: "/profiles/bots?categories=GAME",
        });
        const body = parseBody<BotProfilesBody>(response);

        expect(response.statusCode).toBe(200);
        expect(body.data.some((i) => i.username === BOT_USER.username)).toBe(
            false,
        );
    });

    it("should accept a comma separated category list", async () => {
        const response = await request({
            method: "GET",
            url: "/profiles/bots?categories=GAME,AI",
        });
        const body = parseBody<BotProfilesBody>(response);

        expect(response.statusCode).toBe(200);
        expect(body.data.some((i) => i.username === BOT_USER.username)).toBe(
            true,
        );
    });

    it("should reject an out-of-range limit with 400", async () => {
        const response = await request({
            method: "GET",
            url: "/profiles/bots?limit=0",
        });

        expect(response.statusCode).toBe(400);
    });

    it("should echo pagination in meta", async () => {
        const response = await request({
            method: "GET",
            url: "/profiles/bots?limit=5&offset=0",
        });
        const body = parseBody<BotProfilesBody>(response);

        expect(body.meta.limit).toBe(5);
        expect(body.meta.offset).toBe(0);
        expect(body.meta.count).toBe(body.data.length);
    });

    it("should report isFollowing for an authenticated caller", async () => {
        const before = parseBody<BotProfilesBody>(
            await authRequest(humanAccessToken, {
                method: "GET",
                url: "/profiles/bots",
            }),
        );
        const botBefore = before.data.find(
            (i) => i.username === BOT_USER.username,
        );
        expect(botBefore).toBeDefined();
        expect(botBefore!.isFollowing).toBe(false);

        const followRes = await authRequest(humanAccessToken, {
            method: "POST",
            url: "/follows",
            payload: { targetId: botBefore!.userId },
        });
        expect(followRes.statusCode).toBe(200);

        const after = parseBody<BotProfilesBody>(
            await authRequest(humanAccessToken, {
                method: "GET",
                url: "/profiles/bots",
            }),
        );
        expect(
            after.data.find((i) => i.username === BOT_USER.username)
                ?.isFollowing,
        ).toBe(true);
    });
});
