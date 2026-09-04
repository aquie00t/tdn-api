import {
    authRequest,
    extractRefreshTokenCookie,
    parseBody,
    request,
    server,
} from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

interface Problem {
    title: string;
    status: number;
}

/**
 * E2E tests for account suspension.
 *
 * A ban is applied straight to the database - there is no endpoint and no
 * admin panel - so these tests do exactly that, and then check that a token
 * minted before the ban stops working immediately rather than when it expires.
 */
describe("Account suspension", () => {
    const ts = Date.now();
    const user = {
        email: `ban-${ts}@test.com`,
        password: "password123",
        username: `ban${ts}`,
    };

    let accessToken = "";
    let refreshCookie = "";
    let userId = "";

    /** Flips the column the way an operator would, by hand. */
    async function setBanned(banned: boolean): Promise<void> {
        await server.prisma.user.update({
            where: { id: userId },
            data: { bannedAt: banned ? new Date() : null },
        });
    }

    async function login(): Promise<void> {
        const response = await request({
            method: "POST",
            url: "/auth/login",
            payload: { identifier: user.email, password: user.password },
        });

        accessToken = parseBody<{ data: { accessToken: string } }>(response)
            .data.accessToken;
        refreshCookie = extractRefreshTokenCookie(response);
    }

    beforeAll(async () => {
        const registerRes = await request({
            method: "POST",
            url: "/auth/register",
            payload: user,
        });
        userId = parseBody<{ data: { id: string } }>(registerRes).data.id;

        await login();
    });

    it("should serve a protected endpoint while the account is in good standing", async () => {
        const response = await authRequest(accessToken, {
            method: "GET",
            url: "/notifications?page=1&limit=10",
        });

        expect(response.statusCode).toBe(200);
    });

    it("should refuse the same token once the account is banned", async () => {
        // The token is untouched and still cryptographically valid: this is
        // the whole point of reading the row rather than trusting the claim.
        await setBanned(true);

        const response = await authRequest(accessToken, {
            method: "GET",
            url: "/notifications?page=1&limit=10",
        });

        expect(response.statusCode).toBe(403);
        expect(parseBody<Problem>(response).title).toBe("AccountBannedError");
    });

    it("should refuse a token on a public endpoint that only optionally reads it", async () => {
        const response = await authRequest(accessToken, {
            method: "GET",
            url: "/posts?page=1&limit=10",
        });

        expect(response.statusCode).toBe(403);
    });

    it("should still serve that public endpoint to a guest", async () => {
        // The ban is tied to the identity, not the endpoint. Reading without a
        // token is what anyone on the internet can do anyway.
        const response = await request({
            method: "GET",
            url: "/posts?page=1&limit=10",
        });

        expect(response.statusCode).toBe(200);
    });

    it("should refuse to refresh the session", async () => {
        const response = await request({
            method: "POST",
            url: "/auth/refresh",
            // The helper already returns "refreshToken=<signed value>", so it
            // goes in as a raw Cookie header. Handing it to `cookies` instead
            // nests the name inside its own value and the signature check
            // fails, which answers 401 and hides whatever the ban check did.
            headers: { cookie: refreshCookie },
        });

        expect(response.statusCode).toBe(403);
        expect(parseBody<Problem>(response).title).toBe("AccountBannedError");
    });

    it("should refuse a fresh login with the right password", async () => {
        const response = await request({
            method: "POST",
            url: "/auth/login",
            payload: { identifier: user.email, password: user.password },
        });

        expect(response.statusCode).toBe(403);
        expect(parseBody<Problem>(response).title).toBe("AccountBannedError");
    });

    it("should let the account back in once the ban is lifted", async () => {
        await setBanned(false);

        await login();
        const response = await authRequest(accessToken, {
            method: "GET",
            url: "/notifications?page=1&limit=10",
        });

        expect(response.statusCode).toBe(200);
    });
});
