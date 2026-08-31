import { describe, expect, it } from "vitest";
import {
    rankFeed,
    scoreCandidate,
    type FeedRankingContext,
    type FeedRankingWeights,
} from "@core/use-cases/post/get-posts/feed-ranking";
import type { FeedCandidate } from "@core/domain/interfaces/feed-candidate.interface";

const NOW = new Date("2026-08-31T12:00:00Z");

const WEIGHTS: FeedRankingWeights = {
    language: 3,
    social: 2,
    affinity: 2.5,
    engagement: 0.6,
    halfLifeHours: 18,
    maxPostsPerAuthor: 3,
    foreignLanguageQuota: 0.25,
    // Off by default so the existing ordering assertions stay deterministic;
    // the exploration block below turns it on explicitly.
    explorationRate: 0,
};

function context(
    overrides: Partial<FeedRankingContext> = {},
): FeedRankingContext {
    return {
        languages: ["tr"],
        followingIds: new Set<string>(),
        interests: new Map<string, number>(),
        now: NOW,
        random: () => 0.99,
        ...overrides,
    };
}

let sequence = 0;

function candidate(overrides: Partial<FeedCandidate> = {}): FeedCandidate {
    sequence++;
    return {
        id: `post-${sequence}`,
        authorId: `author-${sequence}`,
        lang: "tr",
        createdAt: NOW,
        likeCount: 0,
        commentCount: 0,
        quoteCount: 0,
        tags: [],
        categories: [],
        ...overrides,
    };
}

/** Hours before the reference time. */
function hoursAgo(hours: number): Date {
    return new Date(NOW.getTime() - hours * 60 * 60 * 1000);
}

describe("scoreCandidate", () => {
    it("should score a post in the viewer's language above one they cannot read", () => {
        const turkish = scoreCandidate(
            candidate({ lang: "tr" }),
            context(),
            WEIGHTS,
        );
        const english = scoreCandidate(
            candidate({ lang: "en" }),
            context(),
            WEIGHTS,
        );

        expect(turkish).toBeGreaterThan(english);
    });

    it("should treat an undetected language as neutral, not as foreign", () => {
        const unknown = scoreCandidate(
            candidate({ lang: null }),
            context(),
            WEIGHTS,
        );
        const foreign = scoreCandidate(
            candidate({ lang: "en" }),
            context(),
            WEIGHTS,
        );
        const match = scoreCandidate(
            candidate({ lang: "tr" }),
            context(),
            WEIGHTS,
        );

        expect(unknown).toBeGreaterThan(foreign);
        expect(unknown).toBeLessThan(match);
    });

    it("should honour every language the viewer reads", () => {
        const bilingual = context({ languages: ["tr", "en"] });

        expect(
            scoreCandidate(candidate({ lang: "en" }), bilingual, WEIGHTS),
        ).toBe(scoreCandidate(candidate({ lang: "tr" }), bilingual, WEIGHTS));
    });

    it("should lift a post from an account the viewer follows", () => {
        const followed = context({ followingIds: new Set(["author-x"]) });

        expect(
            scoreCandidate(
                candidate({ authorId: "author-x" }),
                followed,
                WEIGHTS,
            ),
        ).toBeGreaterThan(
            scoreCandidate(
                candidate({ authorId: "author-y" }),
                followed,
                WEIGHTS,
            ),
        );
    });

    it("should halve a score every half-life", () => {
        const fresh = scoreCandidate(
            candidate({ createdAt: NOW }),
            context(),
            WEIGHTS,
        );
        const older = scoreCandidate(
            candidate({ createdAt: hoursAgo(WEIGHTS.halfLifeHours) }),
            context(),
            WEIGHTS,
        );

        expect(older).toBeCloseTo(fresh / 2, 6);
    });

    it("should damp engagement so one viral post cannot own the feed", () => {
        const modest = scoreCandidate(
            candidate({ likeCount: 10 }),
            context(),
            WEIGHTS,
        );
        const viral = scoreCandidate(
            candidate({ likeCount: 1000 }),
            context(),
            WEIGHTS,
        );
        const none = scoreCandidate(
            candidate({ likeCount: 0 }),
            context(),
            WEIGHTS,
        );

        expect(viral).toBeGreaterThan(modest);
        // A hundredfold difference in likes must not buy a hundredfold score.
        expect(viral - none).toBeLessThan(4 * (modest - none));
    });

    it("should not let a timestamp from the future outscore a brand new post", () => {
        const skewed = scoreCandidate(
            candidate({ createdAt: hoursAgo(-6) }),
            context(),
            WEIGHTS,
        );
        const now = scoreCandidate(
            candidate({ createdAt: NOW }),
            context(),
            WEIGHTS,
        );

        expect(skewed).toBe(now);
    });
});

describe("rankFeed", () => {
    it("should return every candidate exactly once", () => {
        const pool = [
            candidate({ lang: "en" }),
            candidate({ lang: "tr" }),
            candidate({ lang: null }),
        ];

        const ranked = rankFeed(pool, context(), WEIGHTS);

        expect(ranked).toHaveLength(pool.length);
        expect(new Set(ranked.map((c) => c.id)).size).toBe(pool.length);
    });

    it("should not mutate the pool it was given", () => {
        const pool = [candidate({ id: "a" }), candidate({ id: "b" })];
        const snapshot = pool.map((c) => c.id);

        rankFeed(pool, context(), WEIGHTS);

        expect(pool.map((c) => c.id)).toEqual(snapshot);
    });

    it("should put the viewer's language first", () => {
        const ranked = rankFeed(
            [
                candidate({ id: "en-1", lang: "en" }),
                candidate({ id: "tr-1", lang: "tr" }),
            ],
            context(),
            WEIGHTS,
        );

        expect(ranked[0].id).toBe("tr-1");
    });

    it("should hold foreign posts to the quota rather than dropping them", () => {
        const pool = [
            ...Array.from({ length: 8 }, (_, i) =>
                candidate({ id: `en-${i}`, lang: "en", likeCount: 500 }),
            ),
            ...Array.from({ length: 8 }, (_, i) =>
                candidate({ id: `tr-${i}`, lang: "tr" }),
            ),
        ];

        const ranked = rankFeed(pool, context(), WEIGHTS);
        const head = ranked.slice(0, 8);
        const foreignInHead = head.filter((c) => c.lang === "en").length;

        expect(foreignInHead).toBeLessThanOrEqual(
            Math.ceil(8 * WEIGHTS.foreignLanguageQuota),
        );
        // Deferred, never discarded: the tail is still reachable by paging.
        expect(ranked).toHaveLength(pool.length);
    });

    it("should still serve a foreign-only pool", () => {
        const pool = Array.from({ length: 4 }, (_, i) =>
            candidate({ id: `en-${i}`, lang: "en" }),
        );

        const ranked = rankFeed(pool, context(), WEIGHTS);

        expect(ranked.map((c) => c.id).sort()).toEqual(
            pool.map((c) => c.id).sort(),
        );
    });

    it("should stop one author from dominating the head", () => {
        const pool = Array.from({ length: 10 }, (_, i) =>
            candidate({
                id: `spam-${i}`,
                authorId: "prolific-bot",
                createdAt: hoursAgo(i * 0.1),
            }),
        );
        pool.push(
            candidate({
                id: "someone-else",
                authorId: "human",
                createdAt: hoursAgo(5),
            }),
        );

        const ranked = rankFeed(pool, context(), WEIGHTS);
        const headAuthors = ranked
            .slice(0, WEIGHTS.maxPostsPerAuthor + 1)
            .map((c) => c.authorId);

        expect(headAuthors.filter((id) => id === "prolific-bot")).toHaveLength(
            WEIGHTS.maxPostsPerAuthor,
        );
        expect(headAuthors).toContain("human");
    });

    it("should rank the same pool the same way twice", () => {
        // Two posts scoring identically is the common case, and an unstable
        // order there would reshuffle the feed on every rebuild.
        const pool = Array.from({ length: 6 }, (_, i) =>
            candidate({ id: `p${i}`, authorId: `a${i}`, createdAt: NOW }),
        );

        const first = rankFeed(pool, context(), WEIGHTS).map((c) => c.id);
        const second = rankFeed(pool, context(), WEIGHTS).map((c) => c.id);

        expect(first).toEqual(second);
    });

    it("should score a much fresher foreign post above a stale matching one", () => {
        // The quota still decides where it lands - see the slot test below -
        // but the score itself must not pin a four-day-old post above a new
        // one purely for being in the right language.
        const stale = scoreCandidate(
            candidate({ lang: "tr", createdAt: hoursAgo(96) }),
            context(),
            WEIGHTS,
        );
        const fresh = scoreCandidate(
            candidate({ lang: "en", createdAt: NOW }),
            context(),
            WEIGHTS,
        );

        expect(fresh).toBeGreaterThan(stale);
    });

    it("should never open the feed with a language the viewer does not read", () => {
        const ranked = rankFeed(
            [
                candidate({ id: "en-fresh", lang: "en", createdAt: NOW }),
                candidate({
                    id: "tr-stale",
                    lang: "tr",
                    createdAt: hoursAgo(96),
                }),
            ],
            context(),
            WEIGHTS,
        );

        expect(ranked[0].id).toBe("tr-stale");
    });

    it("should spend the quota instead of leaving it unused", () => {
        // Filtering the sorted list would turn foreign posts away for sorting
        // early and never reconsider them, making the quota a ceiling that is
        // never reached. Interleaving admits them where they fit.
        const pool = [
            ...Array.from({ length: 6 }, (_, i) =>
                candidate({ id: `en-${i}`, lang: "en", likeCount: 500 }),
            ),
            ...Array.from({ length: 6 }, (_, i) =>
                candidate({ id: `tr-${i}`, lang: "tr" }),
            ),
        ];

        const head = rankFeed(pool, context(), WEIGHTS).slice(0, 8);

        expect(head.filter((c) => c.lang === "en").length).toBeGreaterThan(0);
    });

    it("should return an empty order for an empty pool", () => {
        expect(rankFeed([], context(), WEIGHTS)).toEqual([]);
    });
    describe("exploration", () => {
        const EXPLORING: FeedRankingWeights = {
            ...WEIGHTS,
            explorationRate: 0.5,
            maxPostsPerAuthor: 100,
            foreignLanguageQuota: 1,
        };

        /** A random source that plays back a fixed sequence, then returns 0. */
        function draws(...values: number[]): () => number {
            let index = 0;
            return () => values[index++] ?? 0;
        }

        it("should still return every candidate exactly once", () => {
            const pool = Array.from({ length: 10 }, (_, i) =>
                candidate({ id: `p${i}` }),
            );

            const ranked = rankFeed(
                pool,
                context({ random: draws(0.1, 0.9, 0.2, 0.4, 0.05, 0.7) }),
                EXPLORING,
            );

            expect(ranked.map((c) => c.id).sort()).toEqual(
                pool.map((c) => c.id).sort(),
            );
        });

        it("should promote a candidate that did not win on score", () => {
            const pool = Array.from({ length: 10 }, (_, i) =>
                candidate({ id: `p${i}`, createdAt: hoursAgo(i) }),
            );

            // First draw is under the rate, so the slot explores; the second
            // picks the last of the nine waiting behind the leader.
            const ranked = rankFeed(
                pool,
                context({ random: draws(0.1, 0.99) }),
                EXPLORING,
            );

            expect(ranked[0].id).not.toBe("p0");
        });

        it("should reach deep into the tail, not just behind the leader", () => {
            // The post the ranking is most wrong about is the one furthest
            // down; a draw that only ever swapped neighbours would never find
            // it.
            const pool = Array.from({ length: 20 }, (_, i) =>
                candidate({ id: `p${i}`, createdAt: hoursAgo(i) }),
            );

            const ranked = rankFeed(
                pool,
                context({ random: draws(0.1, 0.99) }),
                EXPLORING,
            );

            expect(ranked[0].id).toBe("p19");
        });

        it("should take the best remaining when the draw is above the rate", () => {
            const pool = Array.from({ length: 5 }, (_, i) =>
                candidate({ id: `p${i}`, createdAt: hoursAgo(i) }),
            );

            const ranked = rankFeed(
                pool,
                context({ random: () => 0.99 }),
                EXPLORING,
            );

            expect(ranked.map((c) => c.id)).toEqual([
                "p0",
                "p1",
                "p2",
                "p3",
                "p4",
            ]);
        });

        it("should change nothing when the rate is zero", () => {
            const pool = Array.from({ length: 6 }, (_, i) =>
                candidate({ id: `p${i}`, createdAt: hoursAgo(i) }),
            );

            const exploited = rankFeed(pool, context({ random: () => 0 }), {
                ...EXPLORING,
                explorationRate: 0,
            });

            expect(exploited.map((c) => c.id)).toEqual([
                "p0",
                "p1",
                "p2",
                "p3",
                "p4",
                "p5",
            ]);
        });

        it("should not let a promoted post escape the per-author cap", () => {
            // Exploration runs before the constraints precisely so it cannot
            // become a hole one author fills a page through.
            const pool = [
                ...Array.from({ length: 10 }, (_, i) =>
                    candidate({
                        id: `spam-${i}`,
                        authorId: "prolific",
                        createdAt: hoursAgo(i),
                    }),
                ),
                ...Array.from({ length: 5 }, (_, i) =>
                    candidate({ id: `other-${i}`, authorId: `human-${i}` }),
                ),
            ];

            const ranked = rankFeed(pool, context({ random: () => 0 }), {
                ...WEIGHTS,
                explorationRate: 0.9,
                foreignLanguageQuota: 1,
            });

            const head = ranked.slice(0, WEIGHTS.maxPostsPerAuthor + 2);
            expect(
                head.filter((c) => c.authorId === "prolific").length,
            ).toBeLessThanOrEqual(WEIGHTS.maxPostsPerAuthor);
        });

        it("should not let a promoted post break the language quota", () => {
            const pool = [
                ...Array.from({ length: 10 }, (_, i) =>
                    candidate({ id: `en-${i}`, lang: "en" }),
                ),
                ...Array.from({ length: 10 }, (_, i) =>
                    candidate({ id: `tr-${i}`, lang: "tr" }),
                ),
            ];

            const ranked = rankFeed(pool, context({ random: () => 0 }), {
                ...WEIGHTS,
                explorationRate: 0.9,
            });

            const head = ranked.slice(0, 8);
            expect(
                head.filter((c) => c.lang === "en").length,
            ).toBeLessThanOrEqual(Math.ceil(8 * WEIGHTS.foreignLanguageQuota));
        });

        it("should leave a single-candidate pool alone", () => {
            const pool = [candidate({ id: "only" })];

            expect(
                rankFeed(pool, context({ random: () => 0 }), EXPLORING),
            ).toHaveLength(1);
        });
    });
});
