import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetPostsUseCase } from "@core/use-cases/post/get-posts";
import type { FeedRankingWeights } from "@core/use-cases/post/get-posts/feed-ranking";
import {
    decodeFeedCursor,
    encodeFeedCursor,
} from "@core/use-cases/post/get-posts/feed-cursor";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import type { IUserInterestRepository } from "@core/ports/repositories/user-interest.repository";
import { InterestKind } from "@core/domain/interfaces/user-interest.interface";
import type { CachePort } from "@core/ports/services/cache.port";
import type { CryptoPort } from "@core/ports/services/crypto.port";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { FeedCandidate } from "@core/domain/interfaces/feed-candidate.interface";
import { UnauthorizedError } from "@core/errors";
import { PostType } from "@core/domain/enums/post-type.enum";
import { buildPost } from "../../../helpers/mock-factories";

const WEIGHTS: FeedRankingWeights = {
    language: 3,
    social: 2,
    affinity: 2.5,
    engagement: 0.6,
    halfLifeHours: 18,
    maxPostsPerAuthor: 3,
    foreignLanguageQuota: 0.25,
};

const POOL_SIZE = 300;
const WINDOW_DAYS = 7;

/**
 * A cache that actually stores things.
 *
 * The feed keeps two entries that expire for different reasons - a pointer to
 * the current order and the snapshot it addresses - and asserting on that
 * relationship through a bare `vi.fn()` would mean re-implementing it in every
 * test. This models it once, and exposes the key space so a test can expire
 * exactly one of the two.
 */
class FakeCache implements Pick<CachePort, "get" | "set"> {
    readonly entries = new Map<string, string>();

    get(key: string): Promise<string | null> {
        return Promise.resolve(this.entries.get(key) ?? null);
    }

    set(key: string, value: string): Promise<void> {
        this.entries.set(key, value);
        return Promise.resolve();
    }

    /** Mimics the purge that publishing a post performs. */
    expirePointers(): void {
        for (const key of this.entries.keys()) {
            if (key.startsWith("posts:feed:")) this.entries.delete(key);
        }
    }

    /** Mimics a scroll snapshot aging out while a reader is still paging. */
    expireSnapshots(): void {
        for (const key of this.entries.keys()) {
            if (key.startsWith("feed:scroll:")) this.entries.delete(key);
        }
    }

    keysMatching(prefix: string): string[] {
        return [...this.entries.keys()].filter((key) => key.startsWith(prefix));
    }
}

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
        tags: [],
        categories: [],
        ...overrides,
    };
}

describe("GetPostsUseCase", () => {
    let useCase: GetPostsUseCase;
    let postRepository: Pick<
        IPostRepository,
        "findAll" | "findFeedCandidates" | "findByIds" | "countAll"
    >;
    let cacheService: FakeCache;
    let followUserRepository: Pick<IFollowRepository, "getFollowingIds">;
    let profileRepository: Pick<IProfileRepository, "findLanguagesByUserId">;
    let userInterestRepository: Pick<IUserInterestRepository, "findByUserId">;
    let cryptoService: Pick<CryptoPort, "generateRandomHex">;
    let tokenSequence: number;

    /** Hydrates whatever ids were asked for, so ordering assertions are real. */
    const hydrateRequestedIds = (): void => {
        vi.mocked(postRepository.findByIds).mockImplementation((ids) =>
            Promise.resolve(ids.map((id) => buildPost({ id }))),
        );
    };

    /** Seeds a ranked pool of `count` posts, each by a different author. */
    const seedPool = (count: number): string[] => {
        const ids = Array.from({ length: count }, (_, i) => `p${i + 1}`);
        vi.mocked(postRepository.findFeedCandidates).mockResolvedValue(
            ids.map((id, i) =>
                buildCandidate({
                    id,
                    authorId: `a${i + 1}`,
                    // Descending age, so the ranked order matches the seeded
                    // order and a test can assert on ids rather than on scores.
                    createdAt: new Date(Date.now() - i * 60 * 1000),
                }),
            ),
        );
        vi.mocked(postRepository.countAll).mockResolvedValue(count);
        return ids;
    };

    beforeEach(() => {
        tokenSequence = 0;
        postRepository = {
            findAll: vi.fn().mockResolvedValue({ posts: [], total: 0 }),
            findFeedCandidates: vi.fn().mockResolvedValue([]),
            findByIds: vi.fn().mockResolvedValue([]),
            countAll: vi.fn().mockResolvedValue(0),
        };
        cacheService = new FakeCache();
        followUserRepository = {
            getFollowingIds: vi.fn().mockResolvedValue([]),
        };
        profileRepository = {
            findLanguagesByUserId: vi.fn().mockResolvedValue([]),
        };
        userInterestRepository = {
            findByUserId: vi.fn().mockResolvedValue([]),
        };
        cryptoService = {
            generateRandomHex: vi.fn(() => `token-${++tokenSequence}`),
        };
        useCase = new GetPostsUseCase(
            postRepository as IPostRepository,
            cacheService as unknown as CachePort,
            followUserRepository as IFollowRepository,
            profileRepository as IProfileRepository,
            userInterestRepository as IUserInterestRepository,
            cryptoService as CryptoPort,
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
            seedPool(3);
            // Deliberately shuffled: Postgres gives no order for an IN lookup.
            vi.mocked(postRepository.findByIds).mockResolvedValue([
                buildPost({ id: "p3" }),
                buildPost({ id: "p1" }),
                buildPost({ id: "p2" }),
            ]);

            const result = await useCase.execute({ limit: 10 });

            const requested = vi.mocked(postRepository.findByIds).mock
                .calls[0][0];
            expect(result.posts.map((post) => post.id)).toEqual(requested);
            expect(result.total).toBe(3);
        });

        it("should drop an id that no longer resolves instead of leaving a hole", async () => {
            seedPool(2);
            vi.mocked(postRepository.findByIds).mockResolvedValue([
                buildPost({ id: "p2" }),
            ]);

            const result = await useCase.execute({ limit: 10 });

            expect(result.posts.map((p) => p.id)).toEqual(["p2"]);
        });

        it("should advance the cursor past a deleted post rather than serving the gap again", async () => {
            seedPool(4);
            vi.mocked(postRepository.findByIds).mockResolvedValue([
                buildPost({ id: "p1" }),
            ]);

            const result = await useCase.execute({ limit: 2 });

            // Two ids were consumed even though one no longer resolves.
            // Advancing by the post count would re-serve the gap forever.
            expect(decodeFeedCursor(result.nextCursor!)?.offset).toBe(2);
        });

        it("should hydrate the page fresh rather than caching whole posts", async () => {
            // Caching hydrated posts would freeze the viewer's own isLiked and
            // isBookmarked for the life of the entry.
            seedPool(1);
            hydrateRequestedIds();

            await useCase.execute({ limit: 10 });

            const [snapshotKey] = cacheService.keysMatching("feed:scroll:");
            expect(JSON.parse(cacheService.entries.get(snapshotKey)!)).toEqual({
                ids: ["p1"],
                total: 1,
            });
        });

        it("should not share a ranked order between viewers reading different languages", async () => {
            await useCase.execute({ limit: 10, acceptLanguage: "tr" });
            await useCase.execute({ limit: 10, acceptLanguage: "en" });

            expect(cacheService.keysMatching("posts:feed:ranked")).toHaveLength(
                2,
            );
        });
    });

    describe("cursor paging", () => {
        it("should walk the feed without repeating or skipping a post", async () => {
            const ids = seedPool(6);
            hydrateRequestedIds();

            const seen: string[] = [];
            let cursor: string | undefined;

            for (let page = 0; page < 3; page++) {
                const result = await useCase.execute({ limit: 2, cursor });
                seen.push(...result.posts.map((post) => post.id));
                cursor = result.nextCursor ?? undefined;
            }

            expect(seen).toEqual(ids);
        });

        it("should keep a reader on their order when a new post rebuilds the feed", async () => {
            // The failure page numbers cannot avoid: publishing invalidates the
            // ranked order, and the reader's next page would be computed
            // against an order they never saw the previous page of.
            seedPool(4);
            hydrateRequestedIds();

            const first = await useCase.execute({ limit: 2 });

            cacheService.expirePointers();
            vi.mocked(postRepository.findFeedCandidates).mockResolvedValue([
                buildCandidate({ id: "brand-new", authorId: "a9" }),
            ]);

            const second = await useCase.execute({
                limit: 2,
                cursor: first.nextCursor!,
            });

            expect(second.posts.map((p) => p.id)).toEqual(["p3", "p4"]);
            expect(second.posts.map((p) => p.id)).not.toContain("brand-new");
        });

        it("should reuse the snapshot rather than re-ranking on every page", async () => {
            seedPool(6);
            hydrateRequestedIds();

            const first = await useCase.execute({ limit: 2 });
            vi.mocked(postRepository.findFeedCandidates).mockClear();

            await useCase.execute({ limit: 2, cursor: first.nextCursor! });

            expect(postRepository.findFeedCandidates).not.toHaveBeenCalled();
        });

        it("should rebuild at the same depth when the snapshot has lapsed", async () => {
            seedPool(6);
            hydrateRequestedIds();

            const first = await useCase.execute({ limit: 2 });
            cacheService.expireSnapshots();
            cacheService.expirePointers();

            const second = await useCase.execute({
                limit: 2,
                cursor: first.nextCursor!,
            });

            // Serving a rebuilt order from the same depth beats failing the
            // request over an expired cache entry.
            expect(second.posts.map((p) => p.id)).toEqual(["p3", "p4"]);
            expect(postRepository.findFeedCandidates).toHaveBeenCalledTimes(2);
        });

        it("should start from the top when the cursor is malformed", async () => {
            seedPool(4);
            hydrateRequestedIds();

            const result = await useCase.execute({
                limit: 2,
                cursor: "not-a-real-cursor",
            });

            expect(result.posts.map((p) => p.id)).toEqual(["p1", "p2"]);
        });

        it("should ignore a page number once a cursor is given", async () => {
            seedPool(6);
            hydrateRequestedIds();

            const first = await useCase.execute({ limit: 2 });
            const second = await useCase.execute({
                page: 5,
                limit: 2,
                cursor: first.nextCursor!,
            });

            expect(second.posts.map((p) => p.id)).toEqual(["p3", "p4"]);
        });

        it("should not hand out a cursor once the feed is exhausted", async () => {
            seedPool(2);
            hydrateRequestedIds();

            const first = await useCase.execute({ limit: 2 });
            const second = await useCase.execute({
                limit: 2,
                cursor: first.nextCursor!,
            });

            expect(second.posts).toEqual([]);
            expect(second.nextCursor).toBeNull();
        });
    });

    describe("page numbers, for clients that have not moved over", () => {
        it("should still serve a page number", async () => {
            seedPool(6);
            hydrateRequestedIds();

            const result = await useCase.execute({ page: 2, limit: 2 });

            expect(result.posts.map((p) => p.id)).toEqual(["p3", "p4"]);
        });

        it("should hand back a cursor so a client can move over mid-scroll", async () => {
            seedPool(6);
            hydrateRequestedIds();

            const result = await useCase.execute({ page: 1, limit: 2 });

            expect(decodeFeedCursor(result.nextCursor!)).toMatchObject({
                offset: 2,
            });
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
            hydrateRequestedIds();

            const result = await useCase.execute({
                limit: 10,
                currentUserId: "user-1",
                // The stored preference has to beat the header, or changing the
                // setting would do nothing on a browser that disagrees.
                acceptLanguage: "tr-TR,tr;q=0.9",
            });

            expect(result.posts[0].id).toBe("en-post");
        });

        it("should fall back to Accept-Language when the user never chose", async () => {
            vi.mocked(postRepository.findFeedCandidates).mockResolvedValue([
                buildCandidate({ id: "tr-post", lang: "tr", authorId: "a1" }),
                buildCandidate({ id: "en-post", lang: "en", authorId: "a2" }),
            ]);
            hydrateRequestedIds();

            const result = await useCase.execute({
                limit: 10,
                currentUserId: "user-1",
                acceptLanguage: "en-GB,en;q=0.9",
            });

            expect(result.posts[0].id).toBe("en-post");
        });

        it("should default a visitor with no header to Turkish", async () => {
            vi.mocked(postRepository.findFeedCandidates).mockResolvedValue([
                buildCandidate({ id: "en-post", lang: "en", authorId: "a1" }),
                buildCandidate({ id: "tr-post", lang: "tr", authorId: "a2" }),
            ]);
            hydrateRequestedIds();

            const result = await useCase.execute({ limit: 10 });

            expect(result.posts[0].id).toBe("tr-post");
        });
    });

    describe("interest affinity", () => {
        it("should lift a post matching what the viewer is into", async () => {
            vi.mocked(userInterestRepository.findByUserId).mockResolvedValue([
                { kind: InterestKind.TAG, key: "rust", weight: 1 },
            ]);
            vi.mocked(postRepository.findFeedCandidates).mockResolvedValue([
                buildCandidate({
                    id: "js",
                    authorId: "a1",
                    tags: ["javascript"],
                }),
                buildCandidate({ id: "rust", authorId: "a2", tags: ["rust"] }),
            ]);
            hydrateRequestedIds();

            const result = await useCase.execute({
                limit: 10,
                currentUserId: "user-1",
            });

            expect(result.posts[0].id).toBe("rust");
        });

        it("should match a category as well as a tag", async () => {
            vi.mocked(userInterestRepository.findByUserId).mockResolvedValue([
                { kind: InterestKind.CATEGORY, key: "ai", weight: 1 },
            ]);
            vi.mocked(postRepository.findFeedCandidates).mockResolvedValue([
                buildCandidate({
                    id: "game",
                    authorId: "a1",
                    categories: ["GAME"],
                }),
                buildCandidate({
                    id: "ai",
                    authorId: "a2",
                    categories: ["AI"],
                }),
            ]);
            hydrateRequestedIds();

            const result = await useCase.execute({
                limit: 10,
                currentUserId: "user-1",
            });

            expect(result.posts[0].id).toBe("ai");
        });

        it("should rank a visitor without asking for a profile", async () => {
            seedPool(2);
            hydrateRequestedIds();

            const result = await useCase.execute({ limit: 10 });

            // Cold start has to degrade into the language-and-freshness feed,
            // not into an extra query that can only come back empty.
            expect(userInterestRepository.findByUserId).not.toHaveBeenCalled();
            expect(result.posts).toHaveLength(2);
        });

        it("should rank a brand new account without a profile", async () => {
            seedPool(2);
            hydrateRequestedIds();

            const result = await useCase.execute({
                limit: 10,
                currentUserId: "brand-new-user",
            });

            expect(result.posts.map((p) => p.id)).toEqual(["p1", "p2"]);
        });
    });

    describe("candidate pool", () => {
        it("should draw candidates from the configured window and cap", async () => {
            const before = Date.now();

            await useCase.execute({ limit: 10 });

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
            seedPool(2);
            hydrateRequestedIds();
            const tail = [buildPost({ id: "p3" })];
            vi.mocked(postRepository.findAll).mockResolvedValue({
                posts: tail,
                total: 50,
            });

            const first = await useCase.execute({ limit: 2 });
            const second = await useCase.execute({
                limit: 2,
                cursor: first.nextCursor!,
            });

            const [params] = vi.mocked(postRepository.findAll).mock.calls[0];
            expect(params.skip).toBe(0);
            expect(params.excludeIds).toEqual(["p1", "p2"]);
            expect(second.posts).toEqual(tail);
        });

        it("should keep counting in the same coordinates as the ranked head", async () => {
            // A cursor that reset to the start of the tail would serve the
            // tail's first page over and over.
            seedPool(2);
            hydrateRequestedIds();
            vi.mocked(postRepository.findAll).mockResolvedValue({
                posts: [buildPost({ id: "t1" }), buildPost({ id: "t2" })],
                total: 50,
            });

            const first = await useCase.execute({ limit: 2 });
            const second = await useCase.execute({
                limit: 2,
                cursor: first.nextCursor!,
            });
            await useCase.execute({ limit: 2, cursor: second.nextCursor! });

            expect(
                vi.mocked(postRepository.findAll).mock.calls[1][0].skip,
            ).toBe(2);
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
            expect(result.nextCursor).toBeNull();
            expect(postRepository.findFeedCandidates).not.toHaveBeenCalled();
        });

        it("should ignore a cursor aimed at a chronological feed", async () => {
            vi.mocked(postRepository.findAll).mockResolvedValue({
                posts: [],
                total: 0,
            });

            await useCase.execute({
                limit: 10,
                type: PostType.SYSTEM_UPDATE,
                cursor: encodeFeedCursor({ token: "stale", offset: 40 }),
            });

            expect(
                vi.mocked(postRepository.findAll).mock.calls[0][0].skip,
            ).toBeUndefined();
        });

        it("should still rank news and job postings", async () => {
            for (const type of [PostType.TECH_NEWS, PostType.JOB_POSTING]) {
                vi.mocked(postRepository.findFeedCandidates).mockClear();

                await useCase.execute({ limit: 10, type });

                expect(postRepository.findFeedCandidates).toHaveBeenCalled();
            }
        });
    });
});
