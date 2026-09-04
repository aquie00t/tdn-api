import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchTagsUseCase } from "@core/use-cases/tag/search-tag";
import type { ITagRepository } from "@core/ports/repositories/tag.repository";

const mockTags = [
    {
        name: "typescript",
        postCount: 42,
        articleCount: 3,
        category: "programming",
    },
    { name: "typeorm", postCount: 10, articleCount: 0, category: null },
];

describe("SearchTagsUseCase", () => {
    let useCase: SearchTagsUseCase;
    let tagRepository: Pick<ITagRepository, "search">;

    beforeEach(() => {
        tagRepository = {
            search: vi.fn().mockResolvedValue(mockTags),
        };
        useCase = new SearchTagsUseCase(tagRepository as ITagRepository);
    });

    it("should return empty array when query is empty string", async () => {
        const result = await useCase.execute({ query: "" });

        expect(result).toEqual([]);
        expect(tagRepository.search).not.toHaveBeenCalled();
    });

    it("should return empty array when query is whitespace only", async () => {
        const result = await useCase.execute({ query: "   " });

        expect(result).toEqual([]);
        expect(tagRepository.search).not.toHaveBeenCalled();
    });

    it("should trim the query before passing to repository", async () => {
        await useCase.execute({ query: "  typescript  ", limit: 5 });

        expect(tagRepository.search).toHaveBeenCalledWith("typescript", 5);
    });

    it("should return mapped tag results for a valid query", async () => {
        const result = await useCase.execute({ query: "type", limit: 10 });

        expect(result).toEqual([
            {
                name: "typescript",
                postCount: 42,
                articleCount: 3,
                category: "programming",
            },
            { name: "typeorm", postCount: 10, articleCount: 0, category: null },
        ]);
    });

    it("should carry articleCount through to the output", async () => {
        // The response schema declares articleCount as required, and
        // fast-json-stringify fails serialization when a required property is
        // missing. This use case remaps repository rows into its own DTO, so a
        // field dropped here surfaces as a 500 rather than a type error.
        vi.mocked(tagRepository.search).mockResolvedValue(mockTags);

        const result = await useCase.execute({ query: "type" });

        expect(result[0]).toHaveProperty("articleCount", 3);
        expect(result[1]).toHaveProperty("articleCount", 0);
        for (const item of result) {
            expect(Object.keys(item).sort()).toEqual([
                "articleCount",
                "category",
                "name",
                "postCount",
            ]);
        }
    });

    it("should pass limit to repository", async () => {
        await useCase.execute({ query: "ts", limit: 20 });

        expect(tagRepository.search).toHaveBeenCalledWith("ts", 20);
    });

    it("should return empty array when repository returns no results", async () => {
        vi.mocked(tagRepository.search).mockResolvedValue([]);

        const result = await useCase.execute({ query: "notfound" });

        expect(result).toEqual([]);
    });

    it("should propagate repository errors", async () => {
        vi.mocked(tagRepository.search).mockRejectedValue(
            new Error("Database error"),
        );

        await expect(useCase.execute({ query: "typescript" })).rejects.toThrow(
            "Database error",
        );
    });
});
