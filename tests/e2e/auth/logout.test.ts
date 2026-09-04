import { extractRefreshTokenCookie, parseBody, request } from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * End-to-end tests for POST /auth/logout.
 *
 * Verifies that logout revokes the refresh token, clears the cookie, and
 * behaves idempotently when no token is present.
 */
describe("POST /auth/logout - Logout Flow", () => {
    const ts = Date.now();

    const user = {
        email: `logout_${ts}@example.com`,
        password: "password123",
        username: `logout_${ts}`.slice(0, 30),
    };

    let refreshCookie: string;
    let accessToken: string;

    /**
     * Register and log in once so we have a valid session ready to log out.
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

        refreshCookie = extractRefreshTokenCookie(loginRes);
    });

    /**
     * A logout request with a valid signed cookie must return 204 No
     * Content and include a Set-Cookie header that clears the refreshToken
     * (max-age 0 or expires in the past).
     */
    it("should return 204 and clear the refreshToken cookie on valid logout", async () => {
        const response = await request({
            method: "POST",
            url: "/auth/logout",
            headers: { cookie: refreshCookie },
        });

        expect(response.statusCode).toBe(204);

        const setCookieHeader = response.headers["set-cookie"];
        const cookieArray = Array.isArray(setCookieHeader)
            ? setCookieHeader
            : [setCookieHeader ?? ""];

        const clearedCookie = cookieArray.find((c) =>
            c.trim().toLowerCase().startsWith("refreshtoken="),
        );

        expect(clearedCookie).toBeDefined();

        const isCleared =
            /max-age=0/i.test(clearedCookie ?? "") ||
            /expires=/i.test(clearedCookie ?? "");

        expect(isCleared).toBe(true);
    });

    /**
     * Calling logout without providing any refresh token must still return
     * 204. Logout is idempotent and must not reveal session state.
     */
    it("should return 204 even when no refresh token cookie is provided", async () => {
        const response = await request({
            method: "POST",
            url: "/auth/logout",
        });

        expect(response.statusCode).toBe(204);
    });

    /**
     * After a successful logout the revoked refresh token must no longer
     * be usable for refreshing. A subsequent refresh attempt must return
     * 401 "Authentication session not found".
     */
    it("should invalidate the session so that a subsequent refresh returns 401", async () => {
        const loginRes = await request({
            method: "POST",
            url: "/auth/login",
            payload: { identifier: user.email, password: user.password },
        });

        const cookie = extractRefreshTokenCookie(loginRes);

        await request({
            method: "POST",
            url: "/auth/logout",
            headers: { cookie },
        });

        const refreshResponse = await request({
            method: "POST",
            url: "/auth/refresh",
            headers: { cookie },
        });

        expect(refreshResponse.statusCode).toBe(401);

        const body = parseBody<{ title: string; detail: string }>(
            refreshResponse,
        );

        expect(body.title).toBe("UnauthorizedError");
        expect(body.detail).toBe(
            "Security alert: Session compromised. All sessions revoked.",
        );
    });
});
