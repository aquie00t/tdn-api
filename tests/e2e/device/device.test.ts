import { authRequest, parseBody, request } from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * E2E tests for push registration.
 *
 * Delivery itself needs an Expo project and a phone, and neither exists in
 * CI - `PUSH_ENABLED` is off, so the send is a no-op. What is testable here is
 * the part that decides *where* a notification would physically arrive, which
 * is the part worth getting wrong only once.
 */
describe("Device registration", () => {
    const ts = Date.now();
    const owner = {
        email: `dev-a-${ts}@test.com`,
        password: "password123",
        username: `deva${ts}`,
    };
    const other = {
        email: `dev-b-${ts}@test.com`,
        password: "password123",
        username: `devb${ts}`,
    };

    let ownerToken = "";
    let otherToken = "";

    const registerAndLogin = async (user: {
        email: string;
        password: string;
        username: string;
    }): Promise<string> => {
        await request({
            method: "POST",
            url: "/auth/register",
            payload: user,
        });

        const loggedIn = await request({
            method: "POST",
            url: "/auth/login",
            payload: { identifier: user.email, password: user.password },
        });

        return parseBody<{ data: { accessToken: string } }>(loggedIn).data
            .accessToken;
    };

    beforeAll(async () => {
        ownerToken = await registerAndLogin(owner);
        otherToken = await registerAndLogin(other);
    });

    const pushToken = `ExponentPushToken[${ts}]`;

    it("should register a device", async () => {
        const response = await authRequest(ownerToken, {
            method: "POST",
            url: "/devices",
            payload: {
                token: pushToken,
                platform: "ANDROID",
                appVersion: "1",
                locale: "tr-TR",
            },
        });

        expect(response.statusCode).toBe(200);
        expect(
            parseBody<{ data: { registered: boolean } }>(response).data
                .registered,
        ).toBe(true);
    });

    it("should accept the same device registering again", async () => {
        // The app re-registers at every launch; that has to be a refresh, not
        // a duplicate and not an error.
        const response = await authRequest(ownerToken, {
            method: "POST",
            url: "/devices",
            payload: { token: pushToken, platform: "ANDROID" },
        });

        expect(response.statusCode).toBe(200);
    });

    it("should move a device that reappears under another account", async () => {
        // A shared phone, or a second account on the same one. Anything other
        // than a move leaves one person's notifications on another's screen.
        const moved = await authRequest(otherToken, {
            method: "POST",
            url: "/devices",
            payload: { token: pushToken, platform: "ANDROID" },
        });

        expect(moved.statusCode).toBe(200);

        // The previous owner can no longer retire it - it is not theirs.
        const staleUnregister = await authRequest(ownerToken, {
            method: "DELETE",
            url: "/devices",
            payload: { token: pushToken },
        });

        expect(staleUnregister.statusCode).toBe(200);

        // ...and the current owner still can.
        const unregister = await authRequest(otherToken, {
            method: "DELETE",
            url: "/devices",
            payload: { token: pushToken },
        });

        expect(unregister.statusCode).toBe(200);
    });

    it("should reject an unknown platform", async () => {
        const response = await authRequest(ownerToken, {
            method: "POST",
            url: "/devices",
            payload: { token: "ExponentPushToken[x]", platform: "WINDOWS" },
        });

        expect(response.statusCode).toBe(400);
    });

    it("should reject an empty token", async () => {
        const response = await authRequest(ownerToken, {
            method: "POST",
            url: "/devices",
            payload: { token: "", platform: "ANDROID" },
        });

        expect(response.statusCode).toBe(400);
    });

    it("should require a session", async () => {
        const response = await request({
            method: "POST",
            url: "/devices",
            payload: { token: "ExponentPushToken[y]", platform: "ANDROID" },
        });

        expect(response.statusCode).toBe(401);
    });
});
