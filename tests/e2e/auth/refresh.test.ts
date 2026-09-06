import { extractRefreshTokenCookie, parseBody, request } from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * End-to-end tests for POST /auth/refresh.
 *
 * Covers token rotation, cookie transport, compromise detection, and
 * edge cases such as missing tokens and soft-deleted accounts.
 */
describe("POST /auth/refresh - Token Refresh Flow", () => {
    const ts = Date.now();

    const user = {
        email: `refresh_${ts}@example.com`,
        password: "password123",
        username: `refresh_${ts}`.slice(0, 30),
    };

    let refreshCookie: string;
    let accessToken: string;

    /**
     * Register and log in once before all tests to obtain a valid refresh
     * token cookie and access token for subsequent scenarios.
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
     * Happy path: a valid signed refreshToken cookie should yield a new
     * access token, a new expiry, and a freshly rotated cookie.
     */
    it("should return a new access token when a valid cookie is provided", async () => {
        const response = await request({
            method: "POST",
            url: "/auth/refresh",
            headers: { cookie: refreshCookie },
        });

        expect(response.statusCode).toBe(200);

        const body = parseBody<{
            data: {
                accessToken: string;
                expiresAt: number;
                user: { id: string; username: string };
            };
            meta: { timestamp: string };
        }>(response);

        expect(body.data.accessToken).toBeDefined();
        expect(typeof body.data.accessToken).toBe("string");
        expect(body.data.expiresAt).toBeDefined();
        expect(body.meta.timestamp).toBeDefined();

        const newCookie = extractRefreshTokenCookie(response);
        expect(newCookie).toBeTruthy();

        refreshCookie = newCookie;
    });

    /**
     * A request with neither a cookie nor a body token must be rejected
     * with 401 UnauthorizedError "Authentication session not found".
     */
    it("should return 401 when no refresh token is provided", async () => {
        const response = await request({
            method: "POST",
            url: "/auth/refresh",
        });

        expect(response.statusCode).toBe(401);

        const body = parseBody<{
            type: string;
            title: string;
            detail: string;
            instance: string;
        }>(response);

        expect(body.type).toBe("about:blank");
        expect(body.title).toBe("UnauthorizedError");
        expect(body.detail).toBe("Authentication session not found");
        expect(body.instance).toBe("/api/v1/auth/refresh");
    });

    /**
     * A tampered or completely invalid cookie value must not pass
     * signature validation and must return 401.
     */
    it("should return 401 when the refresh token cookie is invalid", async () => {
        const response = await request({
            method: "POST",
            url: "/auth/refresh",
            headers: {
                cookie: "refreshToken=s:tampered-invalid-token.fakesig",
            },
        });

        expect(response.statusCode).toBe(401);

        const body = parseBody<{ title: string; detail: string }>(response);
        expect(body.title).toBe("UnauthorizedError");
        expect(body.detail).toBe("Authentication session not found");
    });

    /**
     * Compromise detection.
     *
     * CI runs with `REFRESH_ROTATION_GRACE_SECONDS=0`, so a rotated token
     * presented again is a reuse rather than a retry - the window itself is
     * covered by unit tests, which can move a clock, and this covers the thing
     * that actually protects an account: presenting a retired token kills
     * every session the user has, including ones opened elsewhere.
     */
    it("should revoke every session when a retired token is reused", async () => {
        const ts3 = Date.now();
        const compromiseUser = {
            email: `compromise_${ts3}@example.com`,
            password: "password123",
            username: `cmprs_${ts3}`.slice(0, 30),
        };

        await request({
            method: "POST",
            url: "/auth/register",
            payload: compromiseUser,
        });

        const loginRes = await request({
            method: "POST",
            url: "/auth/login",
            payload: {
                identifier: compromiseUser.email,
                password: compromiseUser.password,
            },
        });

        const originalCookie = extractRefreshTokenCookie(loginRes);

        const firstRefresh = await request({
            method: "POST",
            url: "/auth/refresh",
            headers: { cookie: originalCookie },
        });

        expect(firstRefresh.statusCode).toBe(200);

        // A second session, opened before the alarm. It must not survive it.
        const secondSession = await request({
            method: "POST",
            url: "/auth/login",
            payload: {
                identifier: compromiseUser.email,
                password: compromiseUser.password,
            },
        });
        const siblingCookie = extractRefreshTokenCookie(secondSession);

        const compromiseResponse = await request({
            method: "POST",
            url: "/auth/refresh",
            headers: { cookie: originalCookie },
        });

        expect(compromiseResponse.statusCode).toBe(401);

        const body = parseBody<{ title: string; detail: string }>(
            compromiseResponse,
        );

        expect(body.title).toBe("UnauthorizedError");
        expect(body.detail).toBe(
            "Security alert: Session compromised. All sessions revoked.",
        );

        // The message is not the point - the revocation is. A revocation rolled
        // back with its own transaction leaves this session alive while
        // telling its owner it was killed.
        const sibling = await request({
            method: "POST",
            url: "/auth/refresh",
            headers: { cookie: siblingCookie },
        });

        expect(sibling.statusCode).toBe(401);
    });

    /**
     * Refreshing with a token that was explicitly revoked via logout must
     * return 401 "Authentication session not found".
     */
    it("should return 401 after the associated session has been logged out", async () => {
        const ts4 = Date.now();
        const logoutUser = {
            email: `logout_refresh_${ts4}@example.com`,
            password: "password123",
            username: `lgrfsh_${ts4}`.slice(0, 30),
        };

        await request({
            method: "POST",
            url: "/auth/register",
            payload: logoutUser,
        });

        const loginRes = await request({
            method: "POST",
            url: "/auth/login",
            payload: {
                identifier: logoutUser.email,
                password: logoutUser.password,
            },
        });

        const cookie = extractRefreshTokenCookie(loginRes);

        await request({
            method: "POST",
            url: "/auth/logout",
            headers: { cookie },
        });

        const response = await request({
            method: "POST",
            url: "/auth/refresh",
            headers: { cookie },
        });

        expect(response.statusCode).toBe(401);

        const body = parseBody<{ title: string; detail: string }>(response);
        expect(body.title).toBe("UnauthorizedError");
        expect(body.detail).toBe(
            "Security alert: Session compromised. All sessions revoked.",
        );
    });

    /**
     * Refreshing with a valid token that belongs to a soft-deleted user
     * must return 401 "User account unavailable".
     */
    it("should return 401 when the token owner has been soft-deleted", async () => {
        const ts5 = Date.now();
        const deletedUser = {
            email: `softdel_${ts5}@example.com`,
            password: "password123",
            username: `sftdl_${ts5}`.slice(0, 30),
        };

        await request({
            method: "POST",
            url: "/auth/register",
            payload: deletedUser,
        });

        const loginRes = await request({
            method: "POST",
            url: "/auth/login",
            payload: {
                identifier: deletedUser.email,
                password: deletedUser.password,
            },
        });

        const cookie = extractRefreshTokenCookie(loginRes);
        const token = parseBody<{ data: { accessToken: string } }>(loginRes)
            .data.accessToken;

        await request({
            method: "DELETE",
            url: "/users/me",
            headers: {
                authorization: `Bearer ${token}`,
            },
            payload: { password: deletedUser.password },
        });

        const response = await request({
            method: "POST",
            url: "/auth/refresh",
            headers: { cookie },
        });

        expect(response.statusCode).toBe(401);

        const body = parseBody<{ title: string; detail: string }>(response);
        expect(body.title).toBe("UnauthorizedError");
        expect(body.detail).toBe("User account unavailable");
    });
});
