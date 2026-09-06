import { parseBody, request } from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

interface SessionData {
    accessToken: string;
    refreshToken?: string;
    refreshTokenExpiresAt?: number;
}

/**
 * E2E tests for the two session channels.
 *
 * A browser is answered through the refresh cookie; a native client, which
 * cannot depend on a cookie jar surviving an app restart, is answered in the
 * response body. What these cover above all is the boundary between them: the
 * body channel must never open for a caller that arrived on the cookie one,
 * because that is the whole of the web's protection against a page reading its
 * own refresh token.
 */
describe("Native session delivery", () => {
    const ts = Date.now();
    const user = {
        email: `ns-${ts}@test.com`,
        password: "password123",
        username: `ns${ts}`,
    };

    beforeAll(async () => {
        await request({
            method: "POST",
            url: "/auth/register",
            payload: user,
        });
    });

    const login = async (client?: "web" | "native") =>
        request({
            method: "POST",
            url: "/auth/login",
            payload: {
                identifier: user.email,
                password: user.password,
                ...(client ? { client } : {}),
            },
        });

    describe("POST /auth/login", () => {
        it("should give a native client its refresh token in the body", async () => {
            const response = await login("native");
            const data = parseBody<{ data: SessionData }>(response).data;

            expect(response.statusCode).toBe(201);
            expect(typeof data.refreshToken).toBe("string");
            expect(typeof data.refreshTokenExpiresAt).toBe("number");
        });

        it("should not put the refresh token in the body for a web client", async () => {
            const explicit = await login("web");
            const implicit = await login();

            for (const response of [explicit, implicit]) {
                const data = parseBody<{ data: SessionData }>(response).data;

                expect(data.refreshToken).toBeUndefined();
                expect(data.refreshTokenExpiresAt).toBeUndefined();
                expect(response.cookies.length).toBeGreaterThan(0);
            }
        });

        it("should still set the cookie the browser relies on", async () => {
            const response = await login("web");
            const cookie = response.cookies.find(
                (c) => c.name === "refreshToken",
            );

            expect(cookie).toBeDefined();
            expect(cookie?.httpOnly).toBe(true);
        });
    });

    describe("POST /auth/refresh", () => {
        it("should answer a body-borne token in the body", async () => {
            const session = parseBody<{ data: SessionData }>(
                await login("native"),
            ).data;

            const refreshed = await request({
                method: "POST",
                url: "/auth/refresh",
                payload: { refreshToken: session.refreshToken },
            });
            const data = parseBody<{ data: SessionData }>(refreshed).data;

            expect(refreshed.statusCode).toBe(200);
            expect(typeof data.refreshToken).toBe("string");
            expect(data.refreshToken).not.toBe(session.refreshToken);
            expect(
                refreshed.cookies.find((c) => c.name === "refreshToken"),
            ).toBeUndefined();
        });

        it("should answer a cookie-borne token with a cookie and nothing in the body", async () => {
            const loggedIn = await login("web");
            const cookie = loggedIn.cookies.find(
                (c) => c.name === "refreshToken",
            );

            const refreshed = await request({
                method: "POST",
                url: "/auth/refresh",
                cookies: { refreshToken: cookie!.value },
            });
            const data = parseBody<{ data: SessionData }>(refreshed).data;

            expect(refreshed.statusCode).toBe(200);
            expect(data.refreshToken).toBeUndefined();
            expect(
                refreshed.cookies.find((c) => c.name === "refreshToken"),
            ).toBeDefined();
        });

        it("should reject a request carrying no token at all", async () => {
            const response = await request({
                method: "POST",
                url: "/auth/refresh",
            });

            expect(response.statusCode).toBe(401);
        });
    });

    describe("POST /auth/logout", () => {
        it("should accept the token in the body and end that session", async () => {
            const session = parseBody<{ data: SessionData }>(
                await login("native"),
            ).data;

            const loggedOut = await request({
                method: "POST",
                url: "/auth/logout",
                payload: { refreshToken: session.refreshToken },
            });

            expect(loggedOut.statusCode).toBe(204);

            const afterwards = await request({
                method: "POST",
                url: "/auth/refresh",
                payload: { refreshToken: session.refreshToken },
            });

            expect(afterwards.statusCode).toBe(401);
        });
    });
});
