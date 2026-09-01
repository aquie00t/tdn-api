import { describe, expect, it } from "vitest";
import {
    decodeFeedCursor,
    encodeFeedCursor,
} from "@core/use-cases/post/get-posts/feed-cursor";

describe("feed cursor", () => {
    it("should round-trip a cursor", () => {
        const cursor = { token: "a1b2c3d4e5f6", offset: 40 };

        expect(decodeFeedCursor(encodeFeedCursor(cursor))).toEqual(cursor);
    });

    it("should round-trip the first position", () => {
        const cursor = { token: "token", offset: 0 };

        expect(decodeFeedCursor(encodeFeedCursor(cursor))).toEqual(cursor);
    });

    it("should encode to something URL-safe", () => {
        // The cursor travels in a query string on every page request; a raw
        // base64 '+' or '/' would have to survive being re-encoded by every
        // client in between.
        const encoded = encodeFeedCursor({
            token: "ff".repeat(16),
            offset: 9999,
        });

        expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("should not reveal its contents in the encoded form", () => {
        // Not secrecy - it is opaqueness. A client that can read a cursor will
        // eventually construct one, and then the encoding is API.
        const encoded = encodeFeedCursor({ token: "secret-token", offset: 20 });

        expect(encoded).not.toContain("secret-token");
        expect(encoded).not.toContain("20");
    });

    describe("rejecting bad input", () => {
        it.each([
            ["an empty string", ""],
            ["plain text", "not-a-cursor"],
            [
                "valid base64 that is not JSON",
                Buffer.from("hello").toString("base64url"),
            ],
            [
                "JSON that is not an object",
                Buffer.from("[1,2,3]").toString("base64url"),
            ],
            ["JSON null", Buffer.from("null").toString("base64url")],
            [
                "a missing token",
                Buffer.from(JSON.stringify({ o: 10 })).toString("base64url"),
            ],
            [
                "an empty token",
                Buffer.from(JSON.stringify({ t: "", o: 10 })).toString(
                    "base64url",
                ),
            ],
            [
                "a missing offset",
                Buffer.from(JSON.stringify({ t: "abc" })).toString("base64url"),
            ],
            [
                "a negative offset",
                Buffer.from(JSON.stringify({ t: "abc", o: -1 })).toString(
                    "base64url",
                ),
            ],
            [
                "a fractional offset",
                Buffer.from(JSON.stringify({ t: "abc", o: 1.5 })).toString(
                    "base64url",
                ),
            ],
            [
                "an offset beyond safe integers",
                Buffer.from(JSON.stringify({ t: "abc", o: 1e21 })).toString(
                    "base64url",
                ),
            ],
            [
                "a non-string token",
                Buffer.from(JSON.stringify({ t: 42, o: 0 })).toString(
                    "base64url",
                ),
            ],
        ])("should return null for %s", (_label, raw) => {
            expect(decodeFeedCursor(raw)).toBeNull();
        });

        it("should refuse an oversized cursor without parsing it", () => {
            // A real cursor is ~60 characters. Refusing the absurd ones early
            // keeps a hostile query string from being decoded at all.
            const huge = Buffer.from(
                JSON.stringify({ t: "x".repeat(5000), o: 0 }),
            ).toString("base64url");

            expect(decodeFeedCursor(huge)).toBeNull();
        });
    });
});
