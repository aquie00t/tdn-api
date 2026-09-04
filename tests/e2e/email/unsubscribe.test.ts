import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { parseBody, request, server } from "../setup";

/**
 * E2E tests for the unsubscribe link a digest carries.
 *
 * The one endpoint reached with no session at all: the reader arrives from an
 * inbox, hours or weeks after any token would have expired, so the signature
 * in the query is the entire credential.
 */
describe("GET|POST /emails/unsubscribe", () => {
    const ts = Date.now();
    const user = {
        email: `unsub-${ts}@test.com`,
        password: "password123",
        username: `unsub${ts}`,
    };

    let userId = "";
    let token = "";

    /** Signs a link the way the digest does. */
    function sign(id: string): string {
        return createHmac("sha256", server.config.ACCESS_TOKEN_SECRET_KEY)
            .update(`digest-unsubscribe:${id}`)
            .digest("hex");
    }

    /** Reads the opt-out column straight from the database. */
    async function isSubscribed(): Promise<boolean> {
        const row = await server.prisma.user.findUnique({
            where: { id: userId },
            select: { digestOptOutAt: true },
        });

        return row?.digestOptOutAt === null;
    }

    beforeAll(async () => {
        const registerRes = await request({
            method: "POST",
            url: "/auth/register",
            payload: user,
        });
        userId = parseBody<{ data: { id: string } }>(registerRes).data.id;
        token = sign(userId);
    });

    it("should unsubscribe the reader and answer with a page", async () => {
        const response = await request({
            method: "GET",
            url: `/emails/unsubscribe?u=${userId}&t=${token}`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toContain("text/html");
        expect(await isSubscribed()).toBe(false);
    });

    it("should let the reader undo it from the same page", async () => {
        const response = await request({
            method: "GET",
            url: `/emails/unsubscribe?u=${userId}&t=${token}&action=resubscribe`,
        });

        expect(response.statusCode).toBe(200);
        expect(await isSubscribed()).toBe(true);
    });

    it("should accept the bodyless POST a mail client sends", async () => {
        // RFC 8058 one-click; without it Gmail will not show its own
        // unsubscribe button.
        const response = await request({
            method: "POST",
            url: `/emails/unsubscribe?u=${userId}&t=${token}`,
        });

        expect(response.statusCode).toBe(200);
        expect(await isSubscribed()).toBe(false);
    });

    it("should refuse a signature that is not this user's", async () => {
        const other = "22222222-2222-4222-8222-222222222222";

        const response = await request({
            method: "GET",
            url: `/emails/unsubscribe?u=${userId}&t=${sign(other)}`,
        });

        expect(response.statusCode).toBe(401);
    });

    it("should reject a malformed link before it reaches the use case", async () => {
        const response = await request({
            method: "GET",
            url: `/emails/unsubscribe?u=not-a-uuid&t=${token}`,
        });

        expect(response.statusCode).toBe(400);
    });

    it("should reject a link with no signature at all", async () => {
        const response = await request({
            method: "GET",
            url: `/emails/unsubscribe?u=${userId}`,
        });

        expect(response.statusCode).toBe(400);
    });
});
