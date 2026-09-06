import { authRequest, parseBody, request } from "../setup";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * E2E tests for the Google Play endpoints.
 *
 * There is no provider behind them yet - `NoopBillingService` confirms nothing -
 * so what is testable is the half that does not need Google: who may call
 * these, what a purchase nobody can confirm does, and that the notification
 * endpoint is closed to anybody without the push secret.
 */
describe("Play billing", () => {
    const ts = Date.now();
    const user = {
        email: `play-${ts}@test.com`,
        password: "password123",
        username: `play${ts}`,
    };

    let token = "";

    beforeAll(async () => {
        await request({ method: "POST", url: "/auth/register", payload: user });

        const loggedIn = await request({
            method: "POST",
            url: "/auth/login",
            payload: { identifier: user.email, password: user.password },
        });

        token = parseBody<{ data: { accessToken: string } }>(loggedIn).data
            .accessToken;
    });

    describe("POST /billing/play/purchases", () => {
        it("should link an unconfirmable purchase without granting a badge", async () => {
            const response = await authRequest(token, {
                method: "POST",
                url: "/billing/play/purchases",
                payload: {
                    purchaseToken: `tok-${ts}`,
                    productId: "verified_monthly",
                },
            });

            expect(response.statusCode).toBe(200);
            // Nothing confirmed it, so nothing is granted - but the account is
            // now attached to the token, which is the part only this
            // authenticated call can know.
            expect(
                parseBody<{ data: { isVerified: boolean } }>(response).data
                    .isVerified,
            ).toBe(false);
        });

        it("should show up as a pending subscription", async () => {
            const response = await authRequest(token, {
                method: "GET",
                url: "/billing/subscription",
            });

            const data = parseBody<{
                data: { status: string | null; isVerified: boolean };
            }>(response).data;

            expect(data.status).toBe("PENDING");
            expect(data.isVerified).toBe(false);
        });

        it("should require a session", async () => {
            const response = await request({
                method: "POST",
                url: "/billing/play/purchases",
                payload: { purchaseToken: "tok-x", productId: "p" },
            });

            expect(response.statusCode).toBe(401);
        });

        it("should reject an empty purchase token", async () => {
            const response = await authRequest(token, {
                method: "POST",
                url: "/billing/play/purchases",
                payload: { purchaseToken: "", productId: "verified_monthly" },
            });

            expect(response.statusCode).toBe(400);
        });
    });

    describe("POST /billing/play/notifications", () => {
        const body = {
            message: {
                messageId: `msg-${ts}`,
                data: Buffer.from(
                    JSON.stringify({
                        eventTimeMillis: "1767225600000",
                        subscriptionNotification: {
                            notificationType: 2,
                            purchaseToken: `tok-${ts}`,
                        },
                    }),
                ).toString("base64"),
            },
        };

        it("should refuse a caller with no push secret", async () => {
            // The endpoint writes billing state and carries no session; with
            // no secret configured it stays closed rather than open.
            const response = await request({
                method: "POST",
                url: "/billing/play/notifications",
                payload: body,
            });

            expect(response.statusCode).toBe(401);
        });

        it("should refuse a wrong secret", async () => {
            const response = await request({
                method: "POST",
                url: "/billing/play/notifications?token=guessed",
                payload: body,
            });

            expect(response.statusCode).toBe(401);
        });
    });
});
