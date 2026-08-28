import { describe, expect, it } from "vitest";
import { normalizeCategoryQuery } from "../../../../src/http/utils/category-query";
import { PostCategory } from "@core/domain/enums/post-category-enum";

describe("normalizeCategoryQuery", () => {
    it("should return nothing for an absent value", () => {
        expect(normalizeCategoryQuery(undefined)).toEqual({
            categories: [],
            invalid: [],
        });
    });

    it("should return nothing for an empty string", () => {
        expect(normalizeCategoryQuery("")).toEqual({
            categories: [],
            invalid: [],
        });
    });

    it("should parse a single value", () => {
        expect(normalizeCategoryQuery("BACKEND").categories).toEqual([
            PostCategory.BACKEND,
        ]);
    });

    it("should parse a comma separated list", () => {
        expect(normalizeCategoryQuery("BACKEND,FRONTEND").categories).toEqual([
            PostCategory.BACKEND,
            PostCategory.FRONTEND,
        ]);
    });

    it("should parse a repeated-key array", () => {
        expect(
            normalizeCategoryQuery(["BACKEND", "FRONTEND"]).categories,
        ).toEqual([PostCategory.BACKEND, PostCategory.FRONTEND]);
    });

    it("should split a comma separated string wrapped in an array by AJV", () => {
        // Fastify's AJV coerces a scalar querystring value into a single-element
        // array before the controller sees it.
        expect(normalizeCategoryQuery(["BACKEND,FRONTEND"]).categories).toEqual(
            [PostCategory.BACKEND, PostCategory.FRONTEND],
        );
    });

    it("should split every element of a mixed array", () => {
        expect(normalizeCategoryQuery(["AI", "BACKEND,FRONTEND"])).toEqual({
            categories: [
                PostCategory.AI,
                PostCategory.BACKEND,
                PostCategory.FRONTEND,
            ],
            invalid: [],
        });
    });

    it("should treat the comma and repeated-key spellings identically", () => {
        expect(normalizeCategoryQuery("ai,game")).toEqual(
            normalizeCategoryQuery(["ai", "game"]),
        );
    });

    it("should match case-insensitively", () => {
        expect(normalizeCategoryQuery("backend, Frontend").categories).toEqual([
            PostCategory.BACKEND,
            PostCategory.FRONTEND,
        ]);
    });

    it("should ignore blank tokens", () => {
        expect(normalizeCategoryQuery("BACKEND,,  ,FRONTEND")).toEqual({
            categories: [PostCategory.BACKEND, PostCategory.FRONTEND],
            invalid: [],
        });
    });

    it("should report unknown tokens as the caller wrote them", () => {
        expect(normalizeCategoryQuery("BACKEND,DevOps")).toEqual({
            categories: [PostCategory.BACKEND],
            invalid: ["DevOps"],
        });
    });

    it("should report every token as invalid when none are known", () => {
        expect(normalizeCategoryQuery("DEVOPS,QA")).toEqual({
            categories: [],
            invalid: ["DEVOPS", "QA"],
        });
    });
});
