import { parseBody, request } from "../setup";
import { describe, expect, it } from "vitest";

interface ClientMeta {
    minSupportedBuild: number;
    latestBuild: number;
    updateRequired: boolean;
    storeUrl: string;
}

/**
 * E2E tests for the client compatibility endpoint.
 *
 * The one call an app makes before it knows whether it can make any others, so
 * it has to work with no session and no build floor configured - which is the
 * state of every environment until the first release.
 */
describe("GET /meta/client", () => {
    it("should answer without a session", async () => {
        const response = await request({
            method: "GET",
            url: "/meta/client",
        });

        expect(response.statusCode).toBe(200);
    });

    it("should not demand an update when no floor is configured", async () => {
        const response = await request({
            method: "GET",
            url: "/meta/client?build=1",
        });
        const data = parseBody<{ data: ClientMeta }>(response).data;

        expect(data.minSupportedBuild).toBe(0);
        expect(data.updateRequired).toBe(false);
    });

    it("should not demand an update from a caller that did not say which build it is", async () => {
        const response = await request({
            method: "GET",
            url: "/meta/client",
        });

        expect(parseBody<{ data: ClientMeta }>(response).data.updateRequired).toBe(
            false,
        );
    });

    it("should reject a build that is not a number", async () => {
        const response = await request({
            method: "GET",
            url: "/meta/client?build=latest",
        });

        expect(response.statusCode).toBe(400);
    });
});
