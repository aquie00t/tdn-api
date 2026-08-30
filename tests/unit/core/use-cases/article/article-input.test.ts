import { describe, it, expect } from "vitest";
import {
    normalizeBody,
    normalizeTags,
    normalizeTagFilter,
    normalizeTitle,
    validateCoverImageKey,
} from "@core/use-cases/article/article-input";
import { BadRequestError } from "@core/errors";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const FILE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("article input rules", () => {
    describe("normalizeTitle()", () => {
        it("should trim surrounding whitespace", () => {
            expect(normalizeTitle("  Hello  ")).toBe("Hello");
        });

        it("should reject a blank title", () => {
            expect(() => normalizeTitle("   ")).toThrow(BadRequestError);
        });

        it("should reject control characters", () => {
            const withNul = "Title" + String.fromCharCode(0);
            const withUnitSeparator = "Title" + String.fromCharCode(31);
            const withDelete = "Title" + String.fromCharCode(127);

            expect(() => normalizeTitle(withNul)).toThrow(BadRequestError);
            expect(() => normalizeTitle(withUnitSeparator)).toThrow(
                BadRequestError,
            );
            expect(() => normalizeTitle(withDelete)).toThrow(BadRequestError);
        });

        it("should keep non-ASCII letters intact", () => {
            expect(normalizeTitle("Yazılım Mühendisliği")).toBe(
                "Yazılım Mühendisliği",
            );
        });
    });

    describe("normalizeBody()", () => {
        it("should reject a body containing a null byte", () => {
            expect(() =>
                normalizeBody("before" + String.fromCharCode(0) + "after"),
            ).toThrow(BadRequestError);
        });

        it("should reject a blank body", () => {
            expect(() => normalizeBody("\n\n   \t")).toThrow(BadRequestError);
        });

        it("should keep markdown exactly as written", () => {
            const markdown =
                "# Title\n\n<script>alert(1)</script>\n\n```ts\nconst a = 1;\n```";

            expect(normalizeBody(markdown)).toBe(markdown);
        });
    });

    describe("normalizeTags()", () => {
        it("should return an empty array when no tags are supplied", () => {
            expect(normalizeTags()).toEqual([]);
            expect(normalizeTags([])).toEqual([]);
        });

        it("should lowercase, trim and de-duplicate", () => {
            expect(normalizeTags([" Fastify ", "fastify", "PRISMA"])).toEqual([
                "fastify",
                "prisma",
            ]);
        });

        it("should reject tags with characters outside the allowed set", () => {
            expect(() => normalizeTags(["hello world"])).toThrow(
                BadRequestError,
            );
            expect(() => normalizeTags(["yazılım"])).toThrow(BadRequestError);
            expect(() => normalizeTags(["tag!"])).toThrow(BadRequestError);
        });

        it("should reject a tag longer than 30 characters", () => {
            expect(() => normalizeTags(["a".repeat(31)])).toThrow(
                BadRequestError,
            );
        });

        it("should reject more than five distinct tags", () => {
            expect(() => normalizeTags(["a", "b", "c", "d", "e", "f"])).toThrow(
                BadRequestError,
            );
        });

        it("should skip blank entries rather than reject them", () => {
            expect(normalizeTags(["fastify", "  ", ""])).toEqual(["fastify"]);
        });
    });

    describe("validateCoverImageKey()", () => {
        it("should treat an absent key as no cover image", () => {
            expect(validateCoverImageKey(undefined, USER)).toBeNull();
            expect(validateCoverImageKey(null, USER)).toBeNull();
            expect(validateCoverImageKey("", USER)).toBeNull();
        });

        it("should accept a key under the requesting user's prefix", () => {
            const key = `articles/covers/${USER}/${FILE}.png`;

            expect(validateCoverImageKey(key, USER)).toBe(key);
        });

        it("should accept every allowed image extension", () => {
            for (const ext of ["jpg", "jpeg", "png", "webp", "gif", "avif"]) {
                const key = `articles/covers/${USER}/${FILE}.${ext}`;
                expect(validateCoverImageKey(key, USER)).toBe(key);
            }
        });

        it("should reject another user's key", () => {
            const key = `articles/covers/${OTHER}/${FILE}.png`;

            expect(() => validateCoverImageKey(key, USER)).toThrow(
                BadRequestError,
            );
        });

        it("should reject a traversal attempt out of the user's prefix", () => {
            const key = `articles/covers/${USER}/../${OTHER}/${FILE}.png`;

            expect(() => validateCoverImageKey(key, USER)).toThrow(
                BadRequestError,
            );
        });

        it("should reject an SVG, which is a script-bearing document format", () => {
            const key = `articles/covers/${USER}/${FILE}.svg`;

            expect(() => validateCoverImageKey(key, USER)).toThrow(
                BadRequestError,
            );
        });

        it("should reject a URL rather than a storage key", () => {
            expect(() =>
                validateCoverImageKey("https://evil.example/x.png", USER),
            ).toThrow(BadRequestError);
            expect(() =>
                validateCoverImageKey("javascript:alert(1)", USER),
            ).toThrow(BadRequestError);
        });

        it("should reject a key outside the covers prefix", () => {
            expect(() =>
                validateCoverImageKey(`avatars/${USER}-1.png`, USER),
            ).toThrow(BadRequestError);
        });

        it("should reject a double extension", () => {
            const key = `articles/covers/${USER}/${FILE}.png.html`;

            expect(() => validateCoverImageKey(key, USER)).toThrow(
                BadRequestError,
            );
        });
    });

    describe("normalizeTagFilter()", () => {
        it("should lowercase and trim the filter", () => {
            expect(normalizeTagFilter("  NodeJS  ")).toBe("nodejs");
        });

        it("should treat a missing or blank filter as no filter", () => {
            expect(normalizeTagFilter()).toBeUndefined();
            expect(normalizeTagFilter("")).toBeUndefined();
            expect(normalizeTagFilter("   ")).toBeUndefined();
        });

        it("should not throw on a malformed filter", () => {
            expect(normalizeTagFilter("Not A Tag!")).toBe("not a tag!");
        });
    });
});
