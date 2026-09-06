import { describe, expect, it } from "vitest";
import {
    fingerprintBody,
    idempotencyCacheKey,
    isReplayable,
} from "@plugins/idempotency/idempotency-record";

describe("idempotencyCacheKey", () => {
    it("should give two accounts separate buckets for the same key", () => {
        // A key is a value the client invents, so two people picking the same
        // one is ordinary. A shared bucket would hand one of them the other's
        // response.
        const mine = idempotencyCacheKey("user-1", "POST", "/posts", "abc");
        const theirs = idempotencyCacheKey("user-2", "POST", "/posts", "abc");

        expect(mine).not.toBe(theirs);
    });

    it("should give two routes separate buckets for the same key", () => {
        expect(idempotencyCacheKey("user-1", "POST", "/posts", "abc")).not.toBe(
            idempotencyCacheKey("user-1", "POST", "/articles", "abc"),
        );
    });

    it("should be stable for the same request", () => {
        expect(idempotencyCacheKey("user-1", "POST", "/posts", "abc")).toBe(
            idempotencyCacheKey("user-1", "POST", "/posts", "abc"),
        );
    });

    it("should carry a version prefix", () => {
        // What is stored can then change by bumping the prefix, rather than by
        // reasoning about records the previous deploy wrote.
        expect(idempotencyCacheKey("user-1", "POST", "/posts", "abc")).toMatch(
            /^idem:v1:/,
        );
    });
});

describe("fingerprintBody", () => {
    it("should match two identical bodies", () => {
        expect(fingerprintBody({ content: "hello" })).toBe(
            fingerprintBody({ content: "hello" }),
        );
    });

    it("should not depend on key order", () => {
        // The same request serialised differently is still the same request.
        expect(fingerprintBody({ a: 1, b: 2 })).toBe(
            fingerprintBody({ b: 2, a: 1 }),
        );
    });

    it("should notice a difference nested inside the body", () => {
        // The trap: JSON.stringify's second argument is a filter applied at
        // every level, so a naive "sort the top-level keys" drops nested ones
        // and makes two different requests fingerprint the same.
        expect(
            fingerprintBody({ post: { content: "a", tags: ["x"] } }),
        ).not.toBe(fingerprintBody({ post: { content: "a", tags: ["y"] } }));
    });

    it("should not depend on key order at any depth", () => {
        expect(fingerprintBody({ outer: { a: 1, b: 2 } })).toBe(
            fingerprintBody({ outer: { b: 2, a: 1 } }),
        );
    });

    it("should keep array order significant", () => {
        expect(fingerprintBody({ tags: ["a", "b"] })).not.toBe(
            fingerprintBody({ tags: ["b", "a"] }),
        );
    });

    it("should differ for different bodies", () => {
        expect(fingerprintBody({ content: "hello" })).not.toBe(
            fingerprintBody({ content: "goodbye" }),
        );
    });

    it("should handle an absent body", () => {
        expect(fingerprintBody(undefined)).toBe("empty");
        expect(fingerprintBody(null)).toBe("empty");
    });

    it("should not attempt to hash an upload stream", () => {
        // A multipart body has not been read yet; the key alone guards those.
        expect(fingerprintBody(Buffer.from("file"))).toBe("stream");
    });
});

describe("isReplayable", () => {
    it("should remember success", () => {
        for (const status of [200, 201, 204]) {
            expect(isReplayable(status)).toBe(true);
        }
    });

    it("should not remember a rejection or a failure", () => {
        // A 4xx is deterministic - the handler will say the same thing again -
        // and a 5xx must stay retryable, or a transient failure would block
        // the key for as long as the record lives.
        for (const status of [400, 401, 404, 409, 500, 503]) {
            expect(isReplayable(status)).toBe(false);
        }
    });
});
