import { describe, expect, it } from "vitest";
import {
    scoreInterests,
    type InterestScoringWeights,
} from "@core/use-cases/user-interest/rebuild-user-interests";
import {
    InteractionType,
    InterestKind,
    type InteractionSignal,
} from "@core/domain/interfaces/user-interest.interface";

const NOW = new Date("2026-08-31T12:00:00Z");

const WEIGHTS: InterestScoringWeights = {
    halfLifeDays: 10,
    maxInterests: 40,
    minWeight: 0.05,
};

function signal(overrides: Partial<InteractionSignal> = {}): InteractionSignal {
    return {
        type: InteractionType.LIKED,
        tags: [],
        categories: [],
        occurredAt: NOW,
        ...overrides,
    };
}

/** Days before the reference time. */
function daysAgo(days: number): Date {
    return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

/** Looks one interest's weight out of a profile. */
function weightOf(
    interests: ReturnType<typeof scoreInterests>,
    kind: InterestKind,
    key: string,
): number {
    return interests.find((i) => i.kind === kind && i.key === key)?.weight ?? 0;
}

describe("scoreInterests", () => {
    it("should return nothing for a user who has done nothing", () => {
        expect(scoreInterests([], NOW, WEIGHTS)).toEqual([]);
    });

    it("should return nothing when no interaction carried a label", () => {
        const signals = [signal(), signal(), signal()];

        expect(scoreInterests(signals, NOW, WEIGHTS)).toEqual([]);
    });

    it("should normalise the strongest interest to exactly 1", () => {
        // What makes one affinity weight mean the same thing for a heavy user
        // and a light one.
        const interests = scoreInterests(
            [
                signal({ tags: ["rust"] }),
                signal({ tags: ["rust"] }),
                signal({ tags: ["go"] }),
            ],
            NOW,
            WEIGHTS,
        );

        expect(interests[0].weight).toBe(1);
    });

    it("should depend on the ratio between interests, not on how active the user is", () => {
        // Twice as much Rust as Go, at two very different volumes. The feed
        // applies one affinity weight to everybody, so both users have to come
        // out with the same numbers.
        const light = scoreInterests(
            [
                signal({ tags: ["rust"] }),
                signal({ tags: ["rust"] }),
                signal({ tags: ["go"] }),
            ],
            NOW,
            WEIGHTS,
        );
        const heavy = scoreInterests(
            [
                ...Array.from({ length: 50 }, () => signal({ tags: ["rust"] })),
                ...Array.from({ length: 25 }, () => signal({ tags: ["go"] })),
            ],
            NOW,
            WEIGHTS,
        );

        expect(weightOf(heavy, InterestKind.TAG, "rust")).toBe(
            weightOf(light, InterestKind.TAG, "rust"),
        );
        expect(weightOf(heavy, InterestKind.TAG, "go")).toBeCloseTo(
            weightOf(light, InterestKind.TAG, "go"),
            6,
        );
    });

    describe("what an interaction is worth", () => {
        it("should weight authoring above liking", () => {
            const interests = scoreInterests(
                [
                    signal({ type: InteractionType.AUTHORED, tags: ["rust"] }),
                    signal({ type: InteractionType.LIKED, tags: ["go"] }),
                ],
                NOW,
                WEIGHTS,
            );

            expect(weightOf(interests, InterestKind.TAG, "rust")).toBe(1);
            expect(weightOf(interests, InterestKind.TAG, "go")).toBeLessThan(1);
        });

        it("should order the interaction types by the effort they take", () => {
            const interests = scoreInterests(
                [
                    signal({ type: InteractionType.AUTHORED, tags: ["a"] }),
                    signal({ type: InteractionType.COMMENTED, tags: ["b"] }),
                    signal({ type: InteractionType.BOOKMARKED, tags: ["c"] }),
                    signal({ type: InteractionType.LIKED, tags: ["d"] }),
                ],
                NOW,
                WEIGHTS,
            );

            expect(interests.map((i) => i.key)).toEqual(["a", "b", "c", "d"]);
        });
    });

    describe("tag stuffing", () => {
        it("should split one interaction's weight across its tags", () => {
            // A post carrying eight tags is one interaction that happens to be
            // broadly labelled, not eight times the evidence.
            const focused = scoreInterests(
                [signal({ tags: ["rust"] })],
                NOW,
                WEIGHTS,
            );
            const stuffed = scoreInterests(
                [
                    signal({
                        tags: ["rust", "go", "c", "zig", "nim", "d"],
                    }),
                ],
                NOW,
                WEIGHTS,
            );

            // Both normalise to 1 on their own, so compare them in one profile
            // where they compete.
            const together = scoreInterests(
                [
                    signal({ tags: ["focused"] }),
                    signal({ tags: ["a", "b", "c", "d", "e", "f"] }),
                ],
                NOW,
                WEIGHTS,
            );

            expect(focused[0].weight).toBe(1);
            expect(stuffed[0].weight).toBe(1);
            expect(together[0].key).toBe("focused");
            expect(weightOf(together, InterestKind.TAG, "a")).toBeLessThan(0.5);
        });

        it("should not let a stuffed post outweigh a repeated genuine interest", () => {
            const interests = scoreInterests(
                [
                    signal({ tags: ["rust"] }),
                    signal({ tags: ["rust"] }),
                    signal({
                        tags: ["spam1", "spam2", "spam3", "spam4", "spam5"],
                    }),
                ],
                NOW,
                WEIGHTS,
            );

            expect(interests[0].key).toBe("rust");
        });

        it("should score a category independently of how many tags the post had", () => {
            const interests = scoreInterests(
                [
                    signal({
                        tags: ["a", "b", "c", "d"],
                        categories: ["BACKEND"],
                    }),
                ],
                NOW,
                WEIGHTS,
            );

            expect(weightOf(interests, InterestKind.CATEGORY, "backend")).toBe(
                1,
            );
        });
    });

    describe("recency", () => {
        it("should halve an interaction's contribution every half-life", () => {
            const interests = scoreInterests(
                [
                    signal({ tags: ["fresh"] }),
                    signal({
                        tags: ["old"],
                        occurredAt: daysAgo(WEIGHTS.halfLifeDays),
                    }),
                ],
                NOW,
                WEIGHTS,
            );

            expect(weightOf(interests, InterestKind.TAG, "old")).toBeCloseTo(
                0.5,
                6,
            );
        });

        it("should let a new interest overtake an abandoned one", () => {
            // Someone who spent last month on Kubernetes and this week on Rust
            // should be reading about Rust.
            const interests = scoreInterests(
                [
                    ...Array.from({ length: 10 }, () =>
                        signal({
                            tags: ["kubernetes"],
                            occurredAt: daysAgo(40),
                        }),
                    ),
                    ...Array.from({ length: 3 }, () =>
                        signal({ tags: ["rust"], occurredAt: daysAgo(1) }),
                    ),
                ],
                NOW,
                WEIGHTS,
            );

            expect(interests[0].key).toBe("rust");
        });

        it("should return nothing when every interaction has decayed to zero", () => {
            // Normalising by a zero maximum would produce NaN weights, and
            // every one of those interests is worthless anyway.
            const interests = scoreInterests(
                [signal({ tags: ["ancient"], occurredAt: daysAgo(100000) })],
                NOW,
                WEIGHTS,
            );

            expect(interests).toEqual([]);
        });

        it("should not let a future timestamp beat a brand new interaction", () => {
            const interests = scoreInterests(
                [
                    signal({ tags: ["skewed"], occurredAt: daysAgo(-5) }),
                    signal({ tags: ["now"] }),
                ],
                NOW,
                WEIGHTS,
            );

            expect(weightOf(interests, InterestKind.TAG, "skewed")).toBe(
                weightOf(interests, InterestKind.TAG, "now"),
            );
        });
    });

    describe("trimming", () => {
        it("should drop the long tail below the minimum weight", () => {
            const interests = scoreInterests(
                [
                    ...Array.from({ length: 100 }, () =>
                        signal({ tags: ["core"] }),
                    ),
                    signal({ tags: ["stray"] }),
                ],
                NOW,
                WEIGHTS,
            );

            expect(interests.map((i) => i.key)).not.toContain("stray");
        });

        it("should keep at most maxInterests, strongest first", () => {
            const signals = Array.from({ length: 60 }, (_, i) =>
                Array.from({ length: 60 - i }, () =>
                    signal({ tags: [`tag-${i}`] }),
                ),
            ).flat();

            const interests = scoreInterests(signals, NOW, {
                ...WEIGHTS,
                minWeight: 0,
                maxInterests: 10,
            });

            expect(interests).toHaveLength(10);
            expect(interests[0].key).toBe("tag-0");
            expect(
                interests.every(
                    (interest, i) =>
                        i === 0 || interest.weight <= interests[i - 1].weight,
                ),
            ).toBe(true);
        });
    });

    describe("keys", () => {
        it("should fold tag casing together", () => {
            const interests = scoreInterests(
                [signal({ tags: ["React"] }), signal({ tags: ["react"] })],
                NOW,
                WEIGHTS,
            );

            expect(interests).toHaveLength(1);
            expect(interests[0].key).toBe("react");
        });

        it("should keep a tag containing a colon intact", () => {
            // The scorer tallies on a `kind:key` composite; splitting on the
            // wrong colon would mangle the key on the way back out.
            const interests = scoreInterests(
                [signal({ tags: ["c:memory"] })],
                NOW,
                WEIGHTS,
            );

            expect(interests[0]).toMatchObject({
                kind: InterestKind.TAG,
                key: "c:memory",
            });
        });

        it("should ignore blank labels", () => {
            const interests = scoreInterests(
                [signal({ tags: ["  ", "rust"] })],
                NOW,
                WEIGHTS,
            );

            expect(interests.map((i) => i.key)).toEqual(["rust"]);
        });

        it("should keep a tag and a category of the same name apart", () => {
            const interests = scoreInterests(
                [signal({ tags: ["ai"], categories: ["AI"] })],
                NOW,
                WEIGHTS,
            );

            expect(interests).toHaveLength(2);
            expect(interests.map((i) => i.kind).sort()).toEqual([
                InterestKind.CATEGORY,
                InterestKind.TAG,
            ]);
        });
    });

    it("should produce the same profile from the same signals twice", () => {
        // A rebuild that changes nothing should write the same rows in the
        // same order, so a diff of the table means something.
        const signals = [
            signal({ tags: ["a"] }),
            signal({ tags: ["b"] }),
            signal({ tags: ["c"] }),
        ];

        expect(scoreInterests(signals, NOW, WEIGHTS)).toEqual(
            scoreInterests(signals, NOW, WEIGHTS),
        );
    });
});
