/**
 * What an interest is about.
 *
 * Mirrors the `InterestKind` enum in the schema. Declared here rather than
 * imported from the generated client because the domain layer owns its own
 * vocabulary and takes no dependency on Prisma.
 */
export enum InterestKind {
    TAG = "TAG",
    CATEGORY = "CATEGORY",
}

/**
 * A user's affinity for one tag or category.
 */
export interface UserInterest {
    kind: InterestKind;

    /** The tag name, lowercased, or the category enum value. */
    key: string;

    /**
     * Affinity in (0, 1], normalised per user so the strongest interest is 1.
     *
     * Normalising is what makes the feed's affinity weight mean the same thing
     * for a heavy user and a light one: without it, someone who likes fifty
     * posts a day would have every interest outrank an occasional reader's
     * strongest one.
     */
    weight: number;
}

/**
 * One thing a user did, as the interest job reads it back.
 *
 * Deliberately flat: the job scores hundreds of these per user, and what it
 * needs from each is only what the interaction was about, how much that kind
 * of interaction counts, and how long ago it happened.
 */
export interface InteractionSignal {
    /** How the user engaged - authoring counts for more than liking. */
    type: InteractionType;

    /** Tag names carried by the post that was interacted with. */
    tags: string[];

    /** Categories carried by that post. */
    categories: string[];

    /** When the interaction happened. */
    occurredAt: Date;
}

/**
 * The ways a user can express interest in a post.
 *
 * Ordered by how much deliberate effort each takes, which is exactly how the
 * scoring weights them: writing a post about something says far more than
 * tapping a heart on it.
 */
export enum InteractionType {
    AUTHORED = "AUTHORED",
    COMMENTED = "COMMENTED",
    BOOKMARKED = "BOOKMARKED",
    LIKED = "LIKED",
}
