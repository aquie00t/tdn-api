import { describe, expect, it } from "vitest";
import { MentionLimitExceededError } from "@core/errors";
import {
    MAX_MENTIONS,
    extractMentionHandles,
} from "@core/use-cases/shared/mentions/extract-mentions";

describe("extractMentionHandles", () => {
    it("should read a handle out of a sentence", () => {
        expect(extractMentionHandles("selam @ada nasilsin")).toEqual(["ada"]);
    });

    it("should return nothing for a body that names nobody", () => {
        expect(extractMentionHandles("no handles here")).toEqual([]);
    });

    it("should accept the full username character set", () => {
        expect(extractMentionHandles("@ada.lovelace_99 hi")).toEqual([
            "ada.lovelace_99",
        ]);
    });

    it("should not match an email address", () => {
        expect(extractMentionHandles("write to ada@example.com")).toEqual([]);
    });

    it("should not match a handle glued to a path", () => {
        expect(extractMentionHandles("see docs/@v2 for details")).toEqual([]);
    });

    it("should not match a doubled marker", () => {
        expect(extractMentionHandles("@@here")).toEqual([]);
    });

    it("should trim trailing punctuation but keep inner dots", () => {
        expect(extractMentionHandles("thanks @ada.b.")).toEqual(["ada.b"]);
    });

    it("should drop a handle shorter than a username may be", () => {
        expect(extractMentionHandles("@ab is too short")).toEqual([]);
    });

    it("should drop a handle longer than a username may be", () => {
        expect(extractMentionHandles(`@${"a".repeat(31)}`)).toEqual([]);
    });

    it("should deduplicate the same handle regardless of case", () => {
        expect(extractMentionHandles("@Ada and @ada and @ADA")).toEqual([
            "Ada",
        ]);
    });

    it("should preserve the order the handles first appear in", () => {
        expect(extractMentionHandles("@zoe then @ada then @zoe")).toEqual([
            "zoe",
            "ada",
        ]);
    });

    it("should accept exactly the maximum number of handles", () => {
        const body = Array.from(
            { length: MAX_MENTIONS },
            (_, index) => `@user${index}`,
        ).join(" ");

        expect(extractMentionHandles(body)).toHaveLength(MAX_MENTIONS);
    });

    it("should reject a body naming more handles than allowed", () => {
        const body = Array.from(
            { length: MAX_MENTIONS + 1 },
            (_, index) => `@user${index}`,
        ).join(" ");

        expect(() => extractMentionHandles(body)).toThrow(
            MentionLimitExceededError,
        );
    });

    it("should count repeats once against the limit", () => {
        const body = `${"@ada ".repeat(MAX_MENTIONS + 5)}@zoe`;

        expect(extractMentionHandles(body)).toEqual(["ada", "zoe"]);
    });
});
