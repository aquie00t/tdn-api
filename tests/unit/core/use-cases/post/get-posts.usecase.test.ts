import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetPostsUseCase } from "@core/use-cases/post/get-posts";
import type { FeedRankingWeights } from "@core/use-cases/post/get-posts/feed-ranking";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import type { CachePort } from "@core/ports/services/cache.port";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { FeedCandidate } from "@core/domain/interfaces/feed-candidate.interface";
import { UnauthorizedError } from "@core/errors";
import { PostType } from "@core/domain/enums/post-type.enum";
import { buildPost } from "../../../helpers/mock-factories";

const WEIGHTS: FeedRankingWeights = {
    language: 3,
    social: 2,
    engagement: 0.6,
    halfLifeHours: 18,
    maxPostsPerAuthor: 3,
    foreignLanguageQuota: 0.25,
};

const POOL_SIZE = 300;
const WINDOW_DAYS = 7;

/**
 * Builds a candidate with sane defaults, so each test states only what it is
 * actually about.
 */
function buildCandidate(overrides: Partial<FeedCandidate> = {}): FeedCandidate {
    return {
        id: "post-1",
        authorId: "user-1",
        lang: "tr",
        createdAt: new Date(),
        likeCount: 0,
        commentCount: 0,
        quoteCount: 0,
        ...overrides,
    };
}

describe("GetPostsUseCase", () => {
    let useCase: GetPostsUseCase;
    let postRepository: Pick<
        IPostRepository,
        "findAll" | "findFeedCandidates" | "findByIds" | "countAll"
    >;
    let cacheService: Pick<CachePort, "get" | "set">;
    let followUserRepository: Pick<IFollowRepository, "getFollowingIds">;
    let profileRepository: Pick<IProfileRepository, "findLanguagesByUserId">;

    beforeEach(() => {
        postRepository = {
            findAll: vi.fn().mockResolvedValue({ posts: [], total: 0 }),
            findFeedCandidates: vi.fn().mockResolvedValue([]),
            findByIds: vi.fn().mockResolvedValue([]),
            countAll: vi.fn().mockResolvedValue(0),
        };
        cacheService = {
            get: vi.fn().mockResolvedValue(null),
            set: vi.fn().mockResolvedValue(undefined),
        };
        followUserRepository = {
            getFollowingIds: vi.fn().mockResolvedValue([]),
        };
        profileRepository = {
            findLanguagesByUserId: vi.fn().mockResolvedValue([]),
        };
        useCase = new GetPostsUseCase(
            postRepository as IPostRepository,
            cacheService as CachePort,
            followUserRepository as IFollowRepository,
            profileRepository as IProfileRepository,
            WEIGHTS,
            POOL_SIZE,
            WINDOW_DAYS,
        );
    });

    it("should throw UnauthorizedError when followedOnly=true but no userId", async () => {
        await expect(useCase.execute({ followedOnly: true })).rejects.toThrow(
            UnauthorizedError,
        );
    });

    describe("ranked page", () => {
        it("should serve the page in ranked order, not the order the rows came back in", async () => {
            const candidates = [
                buildCandidate({ id: "p1", authorId: "a1" }),
                buildCandidate({ id: "p2", authorId: "a2" }),
                buildCandidate({ id: "p3", authorId: "a3" }),
            ];
            vi.mocked(postRepository.findFeedCandidates).mockResolvedValue(
                candidates,
            );
            vi.mocked(postRepository.countAll).mockResolvedValue(3);
            // Deliberately shuffled: Postgres gives no order for an IN lookup.
            vi.mocked(postRepository.findByIds).mockResolvedValue([
                buildPost({ id: "p3" }),
                buildPost({ id: "p1" }),
                buildPost({ id: "p2" }),
            ]);

            const result = await useCase.execute({ page: 1, limit: 10 });

            const served = result.posts.map((post) => post.id);
            const requested = vi.mocked(postRepository.findByIds).mock
                .calls[0][0];
            expect(served).toEqual(requested);
            expect(result.total).toBe(3);
        });

        it("should page through the ranked order without repeating a post", async () => {
            const ids = ["p1", "p2", "p3", "p4"];
            const ranked = JSON.stringify({ ids, total: 4 });
            vi.mocked(cacheService.get).mockResolvedValue(ranked);
            vi.mocked(postRepository.findByIds).mockImplementation((wanted) =>
                Promise.resolve(wanted.map((id) => buildPost({ id }))),
            );

            const first = await useCase.execute({ page: 1, limit: 2 });
            const second = await useCase.execute({ page: 2, limit: 2 });

            expect(first.posts.map((p) => p.id)).toEqual(["p1", "p2"]);
            expect(second.posts.map((p) => p.id)).toEqual(["p3", "p4"]);
        });

        it("should drop an id that no longer resolves instead of leaving a hole", async () => {
            vi.mocked(cacheService.get).mockResolvedValue(
                JSON.stringify({ ids: ["p1", "p2"], total: 2 }),
            );
            vi.mocked(postRepository.findByIds).mockResolvedValue([
                buildPost({ id: "p2" }),
            ]);

            const result = await useCase.execute({ page: 1, limit: 10 });

            expect(result.posts.map((p) => p.id)).toEqual(["p2"]);
        });

        it("should reuse the cached order rather than rebuilding it", async () => {
            vi.mocked(cacheService.get).mockResolvedValue(
                JSON.stringify({ ids: ["p1"], total: 1 }),
            );

            await useCase.execute({ page: 1, limit: 10 });

            expect(postRepository.findFeedCandidates).not.toHaveBeenCalled();
            expect(cacheService.set).not.toHaveBeenCalled();
        });

        it("should cache the ids and the total, never the posts themselves", async () => {
            // Caching hydrated posts would freeze the viewer's own isLiked and
            // isBookmarked for the life of the entry.
            vi.mocked(postRepository.findFeedCandidates).mockResolvedValue([
                buildCandidate({ id: "p1" }),
            ]);
            vi.mocked(postRepository.countAll).mockResolvedValue(1);

            await useCase.execute({ page: 1, limit: 10 });

            const [, payload] = vi.mocked(cacheService.set).mock.calls[0];
            expect(JSON.parse(payload)).toEqual({ ids: ["p1"], total: 1 });
        });

        it("should keep the cache key under the posts:feed: prefix that post creation purges", async () => {
            await useCase.execute({ page: 1, limit: 10 });

            expect(cacheService.get).toHaveBeenCalledWith(
                expect.stringContaining("posts:feed:"),
            );
        });

        it("should not share a ranked order between viewers reading different languages", async () => {
            await useCase.execute({ page: 1, limit: 10, acceptLanguage: "tr" });
            await useCase.execute({ page: 1, limit: 10, acceptLanguage: "en" });

            const [[turkishKey], [englishKey]] = vi.mocked(cacheService.get)
                .mock.calls;
            expect(turkishKey).not.toBe(englishKey);
        });
    });

    describe("viewer languages", () => {
        it("should rank for the languages a signed-in user chose", async () => {
            vi.mocked(
                profileRepository.findLanguagesByUserId,
            ).mockResolvedValue(["en"]);
            vi.mocked(postRepository.findFeedCandidates).mockResolvedValue([
                buildCandidate({ id: "tr-post", lang: "tr", authorId: "a1" }),
                buildCandidate({ id: "en-post", lang: "en", authorId: "a2" }),
            ]);

            await useCase.execute({
                page: 1,
                limit: 10,
                currentUserId: "user-1",
                // The stored preference has to beat the header, or changing the
                // setting would do nothing on a browser that disagrees.
                acceptLanguage: "tr-TR,tr;q=0.9",
            });

            const [payload] = vi.mocked(cacheService.set).mock.calls.map(
                ([, value]) =>
                    JSON.parse(value) as {
                        ids: string[];
                    },
            );
            expect(payload.ids[0]).toBe("en-post");
        });

        it("should fall back to Accept-Language when the user never chose", async () => {
            vi.mocked(postRepository.findFeedCandidates).mockResolvedValue([
                buildCandidate({ id: "tr-post", lang: "tr", authorId: "a1" }),
                buildCandidate({ id: "en-post", lang: "en", authorId: "a2" }),
            ]);

            await useCase.execute({
                page: 1,
                limit: 10,
                currentUserId: "user-1",
                acceptLanguage: "en-GB,en;q=0.9",
            });

            const [, payload] = vi.mocked(cacheService.set).mock.calls[0];
            expect((JSON.parse(payload) as { ids: string[] }).ids[0]).toBe(
                "en-post",
            );
        });

        it("should default a visitor with no header to Turkish", async () => {
            vi.mocked(postRepository.findFeedCandidates).mockResolvedValue([
                buildCandidate({ id: "en-post", lang: "en", authorId: "a1" }),
                buildCandidate({ id: "tr-post", lang: "tr", authorId: "a2" }),
            ]);

            await useCase.execute({ page: 1, limit: 10 });

            const [, payload] = vi.mocked(cacheService.set).mock.calls[0];
            expect((JSON.parse(payload) as { ids: string[] }).ids[0]).toBe(
                "tr-post",
            );
        });
    });

    describe("candidate pool", () => {
        it("should draw candidates from the configured window and cap", async () => {
            const before = Date.now();

            await useCase.execute({ page: 1, limit: 10 });

            const [params] = vi.mocked(postRepository.findFeedCandidates).mock
                .calls[0];
            expect(params.limit).toBe(POOL_SIZE);
            const windowMs = WINDOW_DAYS * 24 * 60 * 60 * 1000;
            expect(params.since.getTime()).toBeGreaterThanOrEqual(
                before - windowMs - 1000,
            );
            expect(params.since.getTime()).toBeLessThanOrEqual(
                Date.now() - windowMs + 1000,
            );
        });

        it("should restrict the pool to followed accounts when followedOnly is set", async () => {
            vi.mocked(followUserRepository.getFollowingIds).mockResolvedValue([
                "user-2",
                "user-3",
            ]);

            await useCase.execute({
                followedOnly: true,
                currentUserId: "user-1",
            });

            expect(
                vi.mocked(postRepository.findFeedCandidates).mock.calls[0][0]
                    .followingIds,
            ).toEqual(["user-2", "user-3"]);
        });

        it("should read who the viewer follows without narrowing an open feed", async () => {
            vi.mocked(followUserRepository.getFollowingIds).mockResolvedValue([
                "user-2",
            ]);

            await useCase.execute({ currentUserId: "user-1" });

            // The social term needs the follow graph, but an open feed must
            // still show posts from accounts the viewer does not follow.
            expect(followUserRepository.getFollowingIds).toHaveBeenCalledWith(
                "user-1",
            );
            expect(
                vi.mocked(postRepository.findFeedCandidates).mock.calls[0][0]
                    .followingIds,
            ).toBeUndefined();
        });
    });

    describe("beyond the ranked window", () => {
        it("should continue chronologically, excluding everything already ranked", async () => {
            vi.mocked(cacheService.get).mockResolvedValue(
                JSON.stringify({ ids: ["p1", "p2"], total: 50 }),
            );
            const tail = [buildPost({ id: "p3" })];
            vi.mocked(postRepository.findAll).mockResolvedValue({
                posts: tail,
                total: 50,
            });

            const result = await useCase.execute({ page: 2, limit: 2 });

            const [params] = vi.mocked(postRepository.findAll).mock.calls[0];
            // Page 2 at limit 2 starts at offset 2, exactly where the two
            // ranked posts ran out, so the tail starts at its own first row.
            expect(params.skip).toBe(0);
            expect(params.excludeIds).toEqual(["p1", "p2"]);
            expect(result.posts).toEqual(tail);
            expect(result.total).toBe(50);
        });

        it("should offset the tail by how far past the ranked head the page starts", async () => {
            vi.mocked(cacheService.get).mockResolvedValue(
                JSON.stringify({ ids: ["p1", "p2"], total: 50 }),
            );

            await useCase.execute({ page: 3, limit: 5 });

            expect(
                vi.mocked(postRepository.findAll).mock.calls[0][0].skip,
            ).toBe(8);
        });
    });

    describe("feeds that are not ranked", () => {
        it("should serve release notes chronologically", async () => {
            const posts = [buildPost({ id: "p1" }), buildPost({ id: "p2" })];
            vi.mocked(postRepository.findAll).mockResolvedValue({
                posts,
                total: 2,
            });

            const result = await useCase.execute({
                page: 1,
                limit: 10,
                type: PostType.SYSTEM_UPDATE,
            });

            expect(result.posts).toEqual(posts);
            expect(postRepository.findFeedCandidates).not.toHaveBeenCalled();
            expect(cacheService.get).not.toHaveBeenCalled();
        });

        it("should still rank news and job postings", async () => {
            for (const type of [PostType.TECH_NEWS, PostType.JOB_POSTING]) {
                vi.mocked(postRepository.findFeedCandidates).mockClear();

                await useCase.execute({ page: 1, limit: 10, type });

                expect(postRepository.findFeedCandidates).toHaveBeenCalled();
            }
        });
    });
});
