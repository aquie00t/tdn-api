import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetPostsUseCase } from "@core/use-cases/post/get-posts";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { CachePort } from "@core/ports/services/cache.port";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import { UnauthorizedError } from "@core/errors";
import { PostType } from "@core/domain/enums/post-type.enum";
import { buildPost } from "../../../helpers/mock-factories";

describe("GetPostsUseCase", () => {
    let useCase: GetPostsUseCase;
    let postRepository: Pick<IPostRepository, "findAll">;
    let cacheService: Pick<CachePort, "get" | "set">;
    let followRepository: Pick<IFollowRepository, "getFollowingIds">;

    beforeEach(() => {
        postRepository = {
            findAll: vi.fn().mockResolvedValue({ posts: [], total: 0 }),
        };
        cacheService = {
            get: vi.fn().mockResolvedValue(null),
            set: vi.fn().mockResolvedValue(undefined),
        };
        followRepository = {
            getFollowingIds: vi.fn().mockResolvedValue([]),
        };
        useCase = new GetPostsUseCase(
            postRepository as IPostRepository,
            cacheService as CachePort,
            followRepository as IFollowRepository,
        );
    });

    it("should return posts from repository on cache miss", async () => {
        const posts = [buildPost()];
        vi.mocked(postRepository.findAll).mockResolvedValue({
            posts,
            total: 1,
        });

        const result = await useCase.execute({ page: 1, limit: 10 });

        expect(result.posts).toEqual(posts);
        expect(result.total).toBe(1);
    });

    it("should throw UnauthorizedError when followedOnly=true but no userId", async () => {
        await expect(useCase.execute({ followedOnly: true })).rejects.toThrow(
            UnauthorizedError,
        );
    });

    it("should fetch followingIds when followedOnly=true and userId provided", async () => {
        vi.mocked(followRepository.getFollowingIds).mockResolvedValue([
            "user-2",
            "user-3",
        ]);
        vi.mocked(postRepository.findAll).mockResolvedValue({
            posts: [],
            total: 0,
        });

        await useCase.execute({
            followedOnly: true,
            currentUserId: "user-1",
        });

        expect(followRepository.getFollowingIds).toHaveBeenCalledWith("user-1");
        expect(postRepository.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                followingIds: ["user-2", "user-3"],
            }),
        );
    });

    it("should build correct cache key from all params", async () => {
        await useCase.execute({
            page: 2,
            limit: 5,
            currentUserId: "user-1",
        });

        expect(cacheService.get).toHaveBeenCalledWith(
            "posts:feed:page:2:limit:5:type:ALL:tag:ALL:categories:ALL:followedOnly:false:user:user-1",
        );
    });

    it("should store result in cache with 60-second TTL", async () => {
        const posts = [buildPost()];
        vi.mocked(postRepository.findAll).mockResolvedValue({
            posts,
            total: 1,
        });

        await useCase.execute({ page: 1, limit: 10 });

        expect(cacheService.set).toHaveBeenCalledWith(
            expect.stringContaining("posts:feed:"),
            expect.any(String),
            60,
        );
    });

    it("should return cached posts on cache hit", async () => {
        const post = buildPost();
        const cached = JSON.stringify({
            posts: [
                {
                    id: post.id,
                    content: post.content,
                    type: post.type,
                    mediaUrls: post.mediaUrls,
                    author: post.author,
                    tags: post.tags,
                    categories: post.categories,
                    createdAt: post.createdAt.toISOString(),
                    updatedAt: post.updatedAt.toISOString(),
                },
            ],
            total: 1,
        });
        vi.mocked(cacheService.get).mockResolvedValue(cached);

        const result = await useCase.execute({ page: 1, limit: 10 });

        expect(result.total).toBe(1);
        expect(result.posts).toHaveLength(1);
        expect(postRepository.findAll).not.toHaveBeenCalled();
    });

    it("should revive the quoted post's date on a cache hit", async () => {
        // Caching a Post serialises its private props bag, and every date in
        // it comes back a string. Without the nested revival the same request
        // would answer with a Date on a miss and a string for the 60 seconds
        // after it.
        const post = buildPost({
            quotedPostId: "post-0",
            quotedPost: {
                id: "post-0",
                content: "The quoted post",
                mediaUrls: [],
                createdAt: new Date("2024-01-01T00:00:00Z"),
                author: { id: "user-9", username: "quoted-author" },
            },
        });
        vi.mocked(cacheService.get).mockResolvedValue(
            JSON.stringify({ posts: [post], total: 1 }),
        );

        const result = await useCase.execute({ page: 1, limit: 10 });

        expect(result.posts[0].quotedPost?.createdAt).toBeInstanceOf(Date);
        expect(result.posts[0].quotedPost?.content).toBe("The quoted post");
        expect(result.posts[0].quotedPostId).toBe("post-0");
    });

    it("should leave a cached plain post without a quote", async () => {
        vi.mocked(cacheService.get).mockResolvedValue(
            JSON.stringify({ posts: [buildPost()], total: 1 }),
        );

        const result = await useCase.execute({ page: 1, limit: 10 });

        expect(result.posts[0].quotedPost).toBeUndefined();
        expect(result.posts[0].isQuote()).toBe(false);
    });

    describe("ordering", () => {
        const ids = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];

        function cachedPage(type: PostType): string {
            return JSON.stringify({
                posts: ids.map((id) => {
                    const post = buildPost({ id, type });
                    return {
                        id,
                        content: post.content,
                        type,
                        mediaUrls: post.mediaUrls,
                        author: post.author,
                        tags: post.tags,
                        categories: post.categories,
                        createdAt: post.createdAt.toISOString(),
                        updatedAt: post.updatedAt.toISOString(),
                    };
                }),
                total: ids.length,
            });
        }

        it("should keep a cached non-community feed in its stored order", async () => {
            // A release feed is only useful chronologically. The cached path
            // used to shuffle unconditionally, so the same request came back
            // ordered on a miss and randomised for the next 60 seconds.
            vi.mocked(cacheService.get).mockResolvedValue(
                cachedPage(PostType.TECH_NEWS),
            );

            for (let attempt = 0; attempt < 10; attempt++) {
                const result = await useCase.execute({
                    page: 1,
                    limit: 10,
                    type: PostType.TECH_NEWS,
                });

                expect(result.posts.map((p) => p.id)).toEqual(ids);
            }
        });

        it("should keep an unfiltered cached feed in its stored order", async () => {
            vi.mocked(cacheService.get).mockResolvedValue(
                cachedPage(PostType.TECH_NEWS),
            );

            const result = await useCase.execute({ page: 1, limit: 10 });

            expect(result.posts.map((p) => p.id)).toEqual(ids);
        });

        it("should keep a non-community feed in order on a cache miss too", async () => {
            const posts = ids.map((id) =>
                buildPost({ id, type: PostType.TECH_NEWS }),
            );
            vi.mocked(postRepository.findAll).mockResolvedValue({
                posts,
                total: posts.length,
            });

            const result = await useCase.execute({
                page: 1,
                limit: 10,
                type: PostType.TECH_NEWS,
            });

            expect(result.posts.map((p) => p.id)).toEqual(ids);
        });

        it("should still shuffle the community feed on a cache hit", async () => {
            vi.mocked(cacheService.get).mockResolvedValue(
                cachedPage(PostType.COMMUNITY),
            );

            const orders = new Set<string>();
            for (let attempt = 0; attempt < 25; attempt++) {
                const result = await useCase.execute({
                    page: 1,
                    limit: 10,
                    type: PostType.COMMUNITY,
                });

                expect([...result.posts.map((p) => p.id)].sort()).toEqual(
                    [...ids].sort(),
                );
                orders.add(result.posts.map((p) => p.id).join(","));
            }

            // 25 shuffles of 8 items landing on one order would be a shuffle
            // that does not shuffle.
            expect(orders.size).toBeGreaterThan(1);
        });
    });
});
