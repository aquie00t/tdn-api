import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetTrendsUseCase } from "@core/use-cases/post/get-trends";
import type {
    ITagRepository,
    TrendItem,
} from "@core/ports/repositories/tag.repository";
import type { CachePort } from "@core/ports/services/cache.port";

const mockTrends: TrendItem[] = [
    { tag: "typescript", postCount: 100, category: "programming" },
    { tag: "nodejs", postCount: 80, category: null },
];

describe("GetTrendsUseCase", () => {
    let useCase: GetTrendsUseCase;
    let tagRepository: Pick<ITagRepository, "findTrending">;
    let cacheService: Pick<CachePort, "get" | "set">;

    beforeEach(() => {
        tagRepository = {
            findTrending: vi.fn().mockResolvedValue(mockTrends),
        };
        cacheService = {
            get: vi.fn().mockResolvedValue(null),
            set: vi.fn().mockResolvedValue(undefined),
        };
        useCase = new GetTrendsUseCase(
            tagRepository as ITagRepository,
            cacheService as CachePort,
        );
    });

    it("should return cached trends without calling repository", async () => {
        vi.mocked(cacheService.get).mockResolvedValue(
            JSON.stringify(mockTrends),
        );

        const result = await useCase.execute({ limit: 10 });

        expect(result.trends).toEqual(mockTrends);
        expect(tagRepository.findTrending).not.toHaveBeenCalled();
    });

    it("should call repository and cache result on cache miss", async () => {
        vi.mocked(cacheService.get).mockResolvedValue(null);

        const result = await useCase.execute({ limit: 10 });

        expect(tagRepository.findTrending).toHaveBeenCalledOnce();
        expect(cacheService.set).toHaveBeenCalledOnce();
        expect(result.trends).toEqual(mockTrends);
    });

    it("should use correct cache key with limit and 7-day window", async () => {
        await useCase.execute({ limit: 5 });

        expect(cacheService.get).toHaveBeenCalledWith(
            "trends:v2:top:limit:5:window:7",
        );
    });

    it("should use default limit of 10 when not provided", async () => {
        await useCase.execute({});

        expect(cacheService.get).toHaveBeenCalledWith(
            "trends:v2:top:limit:10:window:7",
        );
        expect(tagRepository.findTrending).toHaveBeenCalledWith(
            expect.objectContaining({ limit: 10, windowDays: 7 }),
        );
    });

    it("should cache result with 300-second TTL", async () => {
        await useCase.execute({ limit: 10 });

        expect(cacheService.set).toHaveBeenCalledWith(
            "trends:v2:top:limit:10:window:7",
            JSON.stringify(mockTrends),
            300,
        );
    });
});
