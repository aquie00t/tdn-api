import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetArticlesUseCase } from "@core/use-cases/article/get-articles";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { CachePort } from "@core/ports/services/cache.port";
import { ArticleStatus } from "@core/domain/enums/article-status.enum";
import { PostCategory } from "@core/domain/enums/post-category-enum";
import { UnauthorizedError } from "@core/errors";
import { buildArticle, buildUser } from "../../../helpers/mock-factories";

const VIEWER = "11111111-1111-4111-8111-111111111111";

describe("GetArticlesUseCase", () => {
    let useCase: GetArticlesUseCase;
    let articleRepository: Pick<IArticleRepository, "findAll">;
    let cacheService: Pick<CachePort, "get" | "set">;
    let userRepository: Pick<IUserRepository, "findByUsername">;
    let followUserRepository: Pick<IFollowRepository, "getFollowingIds">;

    beforeEach(() => {
        articleRepository = {
            findAll: vi.fn().mockResolvedValue({
                articles: [
                    buildArticle({
                        id: "a1",
                        status: ArticleStatus.PUBLISHED,
                        publishedAt: new Date("2026-01-01T00:00:00Z"),
                    }),
                ],
                total: 1,
            }),
        };
        cacheService = {
            get: vi.fn().mockResolvedValue(null),
            set: vi.fn().mockResolvedValue(undefined),
        };
        userRepository = { findByUsername: vi.fn() };
        followUserRepository = {
            getFollowingIds: vi.fn().mockResolvedValue(["f1", "f2"]),
        };

        useCase = new GetArticlesUseCase(
            articleRepository as IArticleRepository,
            cacheService as CachePort,
            userRepository as IUserRepository,
            followUserRepository as IFollowRepository,
        );
    });

    it("should query the repository and cache the page on a miss", async () => {
        const result = await useCase.execute({ page: 1, limit: 10 });

        expect(result.total).toBe(1);
        expect(articleRepository.findAll).toHaveBeenCalledTimes(1);
        expect(cacheService.set).toHaveBeenCalledTimes(1);

        const [, , ttl] = vi.mocked(cacheService.set).mock.calls[0];
        expect(ttl).toBe(60);
    });

    it("should serve a cache hit without touching the repository", async () => {
        const cachedPage = JSON.stringify({
            articles: [
                {
                    id: "cached-1",
                    slug: "cached-article-1a2b3c4d",
                    title: "Cached",
                    body: "Cached body",
                    excerpt: null,
                    coverImageKey: null,
                    coverImageAlt: null,
                    status: "PUBLISHED",
                    publishedAt: "2026-01-01T00:00:00.000Z",
                    readingTimeMinutes: 3,
                    author: { id: "u1", username: "someone" },
                    tags: ["fastify"],
                    categories: ["BACKEND"],
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-02T00:00:00.000Z",
                    likeCount: 7,
                    commentCount: 2,
                    isLiked: true,
                    isBookmarked: false,
                },
            ],
            total: 42,
        });
        vi.mocked(cacheService.get).mockResolvedValue(cachedPage);

        const result = await useCase.execute({ page: 1, limit: 10 });

        expect(articleRepository.findAll).not.toHaveBeenCalled();
        expect(result.total).toBe(42);
        expect(result.articles[0].id).toBe("cached-1");
        expect(result.articles[0].title).toBe("Cached");
        expect(result.articles[0].likeCount).toBe(7);
        expect(result.articles[0].isLiked).toBe(true);
        expect(result.articles[0].publishedAt).toBeInstanceOf(Date);
        expect(result.articles[0].createdAt).toBeInstanceOf(Date);
    });

    it("should scope the cache key to the viewer", async () => {
        await useCase.execute({ page: 1, limit: 10, currentUserId: VIEWER });
        const authenticatedKey = vi.mocked(cacheService.get).mock.calls[0][0];

        vi.mocked(cacheService.get).mockClear();
        await useCase.execute({ page: 1, limit: 10 });
        const guestKey = vi.mocked(cacheService.get).mock.calls[0][0];

        expect(authenticatedKey).toContain("user:" + VIEWER);
        expect(guestKey).toContain("user:guest");
        expect(authenticatedKey).not.toBe(guestKey);
    });

    it("should produce a key that the invalidation pattern matches", async () => {
        await useCase.execute({ page: 2, limit: 5, tag: "fastify" });
        const key = vi.mocked(cacheService.get).mock.calls[0][0];

        expect(key.startsWith("articles:list:")).toBe(true);
    });

    it("should lowercase the tag filter before it reaches the repository", async () => {
        await useCase.execute({ tag: "  NodeJS  " });

        expect(articleRepository.findAll).toHaveBeenCalledWith(
            expect.objectContaining({ tag: "nodejs" }),
        );
    });

    it("should drop a blank tag filter instead of matching the empty tag", async () => {
        await useCase.execute({ tag: "   " });

        expect(articleRepository.findAll).toHaveBeenCalledWith(
            expect.objectContaining({ tag: undefined }),
        );
    });

    it("should reuse one key for tags differing only in case", async () => {
        await useCase.execute({ tag: "NodeJS" });
        const first = vi.mocked(cacheService.get).mock.calls[0][0];

        vi.mocked(cacheService.get).mockClear();
        await useCase.execute({ tag: "nodejs" });
        const second = vi.mocked(cacheService.get).mock.calls[0][0];

        expect(first).toBe(second);
    });

    it("should order categories so the same filter reuses one key", async () => {
        await useCase.execute({
            categories: [PostCategory.FRONTEND, PostCategory.BACKEND],
        });
        const first = vi.mocked(cacheService.get).mock.calls[0][0];

        vi.mocked(cacheService.get).mockClear();
        await useCase.execute({
            categories: [PostCategory.BACKEND, PostCategory.FRONTEND],
        });
        const second = vi.mocked(cacheService.get).mock.calls[0][0];

        expect(first).toBe(second);
    });

    it("should reject the followedOnly filter without a viewer", async () => {
        await expect(useCase.execute({ followedOnly: true })).rejects.toThrow(
            UnauthorizedError,
        );
    });

    it("should resolve followed authors when the filter is used", async () => {
        await useCase.execute({ followedOnly: true, currentUserId: VIEWER });

        expect(followUserRepository.getFollowingIds).toHaveBeenCalledWith(
            VIEWER,
        );
        expect(articleRepository.findAll).toHaveBeenCalledWith(
            expect.objectContaining({ followingIds: ["f1", "f2"] }),
        );
    });

    it("should resolve an author username to an id", async () => {
        vi.mocked(userRepository.findByUsername).mockResolvedValue(
            buildUser({ id: "author-9" }),
        );

        await useCase.execute({ authorUsername: "someone" });

        expect(articleRepository.findAll).toHaveBeenCalledWith(
            expect.objectContaining({ authorId: "author-9" }),
        );
    });

    it("should return an empty page for an unknown author rather than an error", async () => {
        vi.mocked(userRepository.findByUsername).mockResolvedValue(null);

        const result = await useCase.execute({ authorUsername: "ghost" });

        expect(result).toEqual({ articles: [], total: 0 });
        expect(articleRepository.findAll).not.toHaveBeenCalled();
    });

    it("should never ask the repository for a status", async () => {
        await useCase.execute({ page: 1, limit: 10 });

        const params = vi.mocked(articleRepository.findAll).mock.calls[0][0];
        expect(params).not.toHaveProperty("status");
    });
});
