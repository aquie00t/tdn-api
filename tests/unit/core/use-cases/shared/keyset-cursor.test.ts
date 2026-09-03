import { describe, expect, it } from "vitest";
import {
    decodeKeysetCursor,
    encodeKeysetCursor,
} from "@core/use-cases/shared/pagination/keyset-cursor";

/**
 * Unit tests for the keyset cursor codec.
 *
 * The decode side matters more than the encode side: a cursor arrives from a
 * query string, so every way it can be wrong has to land on "serve the first
 * page" rather than on a thrown error or, worse, a silently empty result.
 */
describe("keyset cursor", () => {
    const timestamp = new Date("2026-09-03T12:00:00.123Z");
    const id = "conv-1";

    it("round-trips a sort key", () => {
        const decoded = decodeKeysetCursor(
            encodeKeysetCursor({ timestamp, id }),
        );

        expect(decoded?.timestamp).toEqual(timestamp);
        expect(decoded?.id).toBe(id);
    });

    it("preserves millisecond precision", () => {
        // The whole point of the cursor is resuming inside a group of rows
        // that share a timestamp, so a codec that rounded would defeat it.
        const decoded = decodeKeysetCursor(
            encodeKeysetCursor({ timestamp, id }),
        );

        expect(decoded?.timestamp.getMilliseconds()).toBe(123);
    });

    it("does not leak the sort key in readable form", () => {
        const encoded = encodeKeysetCursor({ timestamp, id });

        expect(encoded).not.toContain(id);
        expect(encoded).not.toContain("2026");
    });

    it("is URL-safe", () => {
        const encoded = encodeKeysetCursor({ timestamp, id });

        expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it.each([
        ["empty", ""],
        ["not base64", "!!!not-a-cursor!!!"],
        ["base64 of nonsense", Buffer.from("hello").toString("base64url")],
        [
            "valid JSON, wrong shape",
            Buffer.from(JSON.stringify({ a: 1 })).toString("base64url"),
        ],
        [
            "missing id",
            Buffer.from(
                JSON.stringify({ t: timestamp.toISOString() }),
            ).toString("base64url"),
        ],
        [
            "empty id",
            Buffer.from(
                JSON.stringify({ t: timestamp.toISOString(), i: "" }),
            ).toString("base64url"),
        ],
        [
            "unparseable date",
            Buffer.from(JSON.stringify({ t: "not-a-date", i: id })).toString(
                "base64url",
            ),
        ],
        ["oversized", "a".repeat(600)],
    ])("returns null for a cursor that is %s", (_label, raw) => {
        expect(decodeKeysetCursor(raw)).toBeNull();
    });
});
