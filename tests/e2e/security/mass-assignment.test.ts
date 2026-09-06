import { authRequest, parseBody, request } from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * E2E tests for the identity a request body must never be able to set.
 *
 * Several handlers spread `...request.body` alongside an identity taken from
 * the session. That is only safe while the validator refuses to pass unknown
 * properties through - Fastify's default does *not*, because it only strips
 * them from schemas that say `additionalProperties: false`, and a plain
 * TypeBox object says nothing. The app now runs AJV with
 * `removeAdditional: "all"`, and these are the tests that would fail if that
 * were ever loosened.
 */
describe("Identity cannot be supplied by the request body", () => {
    const ts = Date.now();
    const attacker = {
        email: `ma-a-${ts}@test.com`,
        password: "password123",
        username: `maa${ts}`,
    };
    const victim = {
        email: `ma-v-${ts}@test.com`,
        password: "password123",
        username: `mav${ts}`,
    };

    let attackerToken = "";
    let attackerId = "";
    let victimId = "";

    const registerAndLogin = async (u: {
        email: string;
        password: string;
        username: string;
    }): Promise<{ id: string; token: string }> => {
        const registered = await request({
            method: "POST",
            url: "/auth/register",
            payload: u,
        });
        const id = parseBody<{ data: { id: string } }>(registered).data.id;

        const loggedIn = await request({
            method: "POST",
            url: "/auth/login",
            payload: { identifier: u.email, password: u.password },
        });

        return {
            id,
            token: parseBody<{ data: { accessToken: string } }>(loggedIn).data
                .accessToken,
        };
    };

    beforeAll(async () => {
        const a = await registerAndLogin(attacker);
        const v = await registerAndLogin(victim);

        attackerToken = a.token;
        attackerId = a.id;
        victimId = v.id;
    });

    it("should file an article under the caller, not the id in the body", async () => {
        // Left unchecked this writes a draft owned by the victim, which the
        // same trick can then publish under their byline.
        const response = await authRequest(attackerToken, {
            method: "POST",
            url: "/articles",
            payload: {
                title: `Mass assignment ${ts}`,
                body: "# A body long enough to pass validation.",
                authorId: victimId,
            },
        });

        expect(response.statusCode).toBe(201);

        const author = parseBody<{ data: { author: { id: string } } }>(response)
            .data.author;

        expect(author.id).toBe(attackerId);
        expect(author.id).not.toBe(victimId);
    });

    it("should refuse an edit to somebody else's article, however the body is dressed", async () => {
        // The nastiest variant: UpdateArticleUseCase proves ownership by
        // asking whether `userId` owns the article, so a body carrying the
        // victim's `userId` does not fail that check - it satisfies it.
        const victimSession = await request({
            method: "POST",
            url: "/auth/login",
            payload: { identifier: victim.email, password: victim.password },
        });
        const victimToken = parseBody<{ data: { accessToken: string } }>(
            victimSession,
        ).data.accessToken;

        const created = await authRequest(victimToken, {
            method: "POST",
            url: "/articles",
            payload: {
                title: `Victim article ${ts}`,
                body: "# A body long enough to pass validation.",
            },
        });
        const articleId = parseBody<{ data: { id: string } }>(created).data.id;

        const hijack = await authRequest(attackerToken, {
            method: "PATCH",
            url: `/articles/${articleId}`,
            payload: {
                title: "Rewritten by somebody else",
                userId: victimId,
            },
        });

        expect([403, 404]).toContain(hijack.statusCode);
    });
});
