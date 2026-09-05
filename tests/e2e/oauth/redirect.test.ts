import { request } from "../setup";
import { describe, expect, it } from "vitest";

const FRONTEND_URL = "http://localhost:5173";
const NATIVE_TARGET = "tdn://oauth-success";

/**
 * E2E tests for the OAuth redirect endpoints.
 *
 * Full callback flows need a real provider and are out of scope. What is in
 * scope, and what these cover, is everything that happens around the provider:
 * a flow is bound to a `state` when it starts, the callback spends that state
 * exactly once, and a callback that cannot be tied to a flow completes nothing.
 *
 * Note: `tdn://oauth-success` has to be in `OAUTH_NATIVE_REDIRECT_ALLOWLIST`
 * for the app-target cases; CI sets it.
 */
describe("OAuth Redirect Endpoints", () => {
    /**
     * Starts a flow and returns the state the provider would hand back.
     */
    const startFlow = async (
        provider: "github" | "google",
        redirect?: string,
    ): Promise<{ statusCode: number; location: string; state: string }> => {
        const response = await request({
            method: "GET",
            url: `/oauth/${provider}${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`,
        });

        const location = response.headers.location as string | undefined;
        const state = location
            ? (new URL(location).searchParams.get("state") ?? "")
            : "";

        return { statusCode: response.statusCode, location: location ?? "", state };
    };

    describe("starting a flow", () => {
        it("should redirect to GitHub with a state parameter", async () => {
            const { statusCode, location, state } = await startFlow("github");

            expect(statusCode).toBe(302);
            expect(location).toMatch(
                /^https:\/\/github\.com\/login\/oauth\/authorize/,
            );
            expect(state.length).toBeGreaterThan(16);
        });

        it("should redirect to Google with a state parameter", async () => {
            const { statusCode, location, state } = await startFlow("google");

            expect(statusCode).toBe(302);
            expect(location).toMatch(
                /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/,
            );
            expect(state.length).toBeGreaterThan(16);
        });

        it("should mint a different state each time", async () => {
            const first = await startFlow("github");
            const second = await startFlow("github");

            expect(first.state).not.toBe(second.state);
        });

        it("should refuse a redirect target that is not allow-listed", async () => {
            const response = await request({
                method: "GET",
                url: "/oauth/github?redirect=https%3A%2F%2Fevil.example%2Fsteal",
            });

            // Refused rather than quietly sent somewhere safe: the target
            // receives the exchange code, so guessing is not an option.
            expect(response.statusCode).toBe(400);
        });

        it("should accept an allow-listed app target", async () => {
            const { statusCode, state } = await startFlow(
                "github",
                NATIVE_TARGET,
            );

            expect(statusCode).toBe(302);
            expect(state.length).toBeGreaterThan(16);
        });
    });

    describe("finishing a flow", () => {
        it("should report a provider error on the target the flow started for", async () => {
            const { state } = await startFlow("github");

            const response = await request({
                method: "GET",
                url: `/oauth/github/callback?error=access_denied&state=${state}`,
            });

            expect(response.statusCode).toBe(302);
            expect(response.headers.location).toBe(
                `${FRONTEND_URL}/login?error=github_access_denied`,
            );
        });

        it("should report a missing code on the target the flow started for", async () => {
            const { state } = await startFlow("google");

            const response = await request({
                method: "GET",
                url: `/oauth/google/callback?state=${state}`,
            });

            expect(response.statusCode).toBe(302);
            expect(response.headers.location).toBe(
                `${FRONTEND_URL}/login?error=missing_code`,
            );
        });

        it("should send an app flow's failure to the app", async () => {
            const { state } = await startFlow("github", NATIVE_TARGET);

            const response = await request({
                method: "GET",
                url: `/oauth/github/callback?error=access_denied&state=${state}`,
            });

            expect(response.headers.location).toBe(
                `${NATIVE_TARGET}?error=github_access_denied`,
            );
        });

        it("should complete nothing for a callback with no state", async () => {
            // The shape of a forged callback: an attacker starts a flow with
            // their own account and hands the victim the callback URL.
            const response = await request({
                method: "GET",
                url: "/oauth/github/callback?code=whatever",
            });

            expect(response.statusCode).toBe(302);
            expect(response.headers.location).toBe(
                `${FRONTEND_URL}/login?error=invalid_state`,
            );
        });

        it("should complete nothing for a state that was never issued", async () => {
            const response = await request({
                method: "GET",
                url: "/oauth/github/callback?code=whatever&state=made-up-state",
            });

            expect(response.headers.location).toBe(
                `${FRONTEND_URL}/login?error=invalid_state`,
            );
        });

        it("should spend a state exactly once", async () => {
            const { state } = await startFlow("github");

            const first = await request({
                method: "GET",
                url: `/oauth/github/callback?error=access_denied&state=${state}`,
            });
            const replay = await request({
                method: "GET",
                url: `/oauth/github/callback?error=access_denied&state=${state}`,
            });

            expect(first.headers.location).toBe(
                `${FRONTEND_URL}/login?error=github_access_denied`,
            );
            expect(replay.headers.location).toBe(
                `${FRONTEND_URL}/login?error=invalid_state`,
            );
        });
    });
});
