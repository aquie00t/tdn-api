import {
    InteractionType,
    InterestKind,
    type InteractionSignal,
    type UserInterest,
} from "@core/domain/interfaces/user-interest.interface";

/**
 * Turns what a user did into what they are interested in.
 *
 * Pure and synchronous, like the feed ranker it feeds: this is the other half
 * of the ranking that has to be reasoned about and tuned, so it takes plain
 * signals in and gives weights out, with no repository and no clock of its own.
 */

/**
 * How the tuning of the interest profile is expressed.
 */
export interface InterestScoringWeights {
    /** Days after which an interaction counts for half of what it did. */
    halfLifeDays: number;

    /** Most interests to keep per user, strongest first. */
    maxInterests: number;

    /**
     * Smallest normalised weight worth storing.
     *
     * A profile's long tail is mostly noise - one stray like on a topic the
     * user never returns to - and keeping it would let unrelated posts collect
     * a small affinity bonus forever.
     */
    minWeight: number;
}

/**
 * What each kind of interaction says about interest.
 *
 * The spread is deliberate and wide: authoring a post about Rust is a
 * statement, liking one is barely a nod, and a profile that treated them alike
 * would be dominated by whatever the user scrolls past most.
 */
const INTERACTION_WEIGHTS: Record<InteractionType, number> = {
    [InteractionType.AUTHORED]: 3,
    [InteractionType.COMMENTED]: 2.5,
    [InteractionType.BOOKMARKED]: 2,
    [InteractionType.LIKED]: 1,
};

/**
 * How much of one interaction's weight each individual tag receives.
 *
 * A post carrying eight tags is not eight times the evidence of a post
 * carrying one - it is one interaction that happens to be broadly labelled.
 * Splitting the weight across the tags keeps tag-stuffed posts from writing
 * themselves into every reader's profile.
 *
 * @param count - How many tags or categories the post carried.
 * @returns The share of the interaction's weight each one gets.
 */
function shareOf(count: number): number {
    return count === 0 ? 0 : 1 / count;
}

/**
 * Builds a user's interest profile from their recent interactions.
 *
 * Each signal contributes its interaction weight, split across whatever it was
 * tagged with and decayed by how long ago it happened, and the totals are then
 * normalised so the strongest interest is exactly 1. Normalising is what lets
 * the feed apply one affinity weight to everybody: the raw totals say how
 * active a user is, and the feed does not care about that - only about what
 * they care about, relative to everything else they care about.
 *
 * @param signals - The user's interactions, in any order.
 * @param now - The reference time decay is measured against.
 * @param weights - The tuning weights.
 * @returns The interests worth keeping, strongest first.
 */
export function scoreInterests(
    signals: InteractionSignal[],
    now: Date,
    weights: InterestScoringWeights,
): UserInterest[] {
    const totals = new Map<string, number>();

    for (const signal of signals) {
        const base =
            INTERACTION_WEIGHTS[signal.type] *
            recencyDecay(signal.occurredAt, now, weights.halfLifeDays);

        // Tags and categories are split independently: a post's single
        // category is a full share of the category signal even when the post
        // also carries six tags.
        accumulate(totals, InterestKind.TAG, signal.tags, base);
        accumulate(totals, InterestKind.CATEGORY, signal.categories, base);
    }

    const scored = [...totals.entries()].map(([composite, total]) => {
        const [kind, key] = splitCompositeKey(composite);
        return { kind, key, weight: total };
    });

    if (scored.length === 0) return [];

    const strongest = Math.max(...scored.map((interest) => interest.weight));
    // Guards against a profile built entirely from interactions old enough
    // that every weight has decayed to zero: normalising by it would produce
    // NaN, and every one of those interests is worthless anyway.
    if (strongest <= 0) return [];

    return scored
        .map((interest) => ({
            ...interest,
            weight: interest.weight / strongest,
        }))
        .filter((interest) => interest.weight >= weights.minWeight)
        .sort((a, b) =>
            b.weight !== a.weight
                ? b.weight - a.weight
                : // Deterministic below the weight, so a rebuild that changes
                  // nothing writes the same rows in the same order.
                  `${a.kind}:${a.key}`.localeCompare(`${b.kind}:${b.key}`),
        )
        .slice(0, weights.maxInterests);
}

/**
 * Adds one interaction's share to each key it was about.
 *
 * @param totals - The running totals, mutated in place.
 * @param kind - Whether these keys are tags or categories.
 * @param keys - The keys the interaction was about.
 * @param base - The interaction's decayed weight, before splitting.
 */
function accumulate(
    totals: Map<string, number>,
    kind: InterestKind,
    keys: string[],
    base: number,
): void {
    const share = base * shareOf(keys.length);
    if (share === 0) return;

    for (const key of keys) {
        const normalised = key.trim().toLowerCase();
        if (normalised.length === 0) continue;

        const composite = `${kind}:${normalised}`;
        totals.set(composite, (totals.get(composite) ?? 0) + share);
    }
}

/**
 * Splits a composite map key back into its parts.
 *
 * @param composite - A `kind:key` string.
 * @returns The kind and the key.
 */
function splitCompositeKey(composite: string): [InterestKind, string] {
    const separator = composite.indexOf(":");
    return [
        composite.slice(0, separator) as InterestKind,
        // Sliced rather than split, because a tag may contain a colon and only
        // the first one separates the kind.
        composite.slice(separator + 1),
    ];
}

/**
 * Halves an interaction's contribution every `halfLifeDays`.
 *
 * Interests move. Someone who spent March on Kubernetes and April on Rust
 * should be reading about Rust, and an undecayed profile would keep them on
 * Kubernetes for as long as the aggregation window is wide.
 *
 * @param occurredAt - When the interaction happened.
 * @param now - The reference time.
 * @param halfLifeDays - Days after which the contribution has halved.
 * @returns A multiplier in (0, 1].
 */
function recencyDecay(
    occurredAt: Date,
    now: Date,
    halfLifeDays: number,
): number {
    const ageDays = Math.max(
        (now.getTime() - occurredAt.getTime()) / (1000 * 60 * 60 * 24),
        0,
    );

    return Math.pow(0.5, ageDays / halfLifeDays);
}
