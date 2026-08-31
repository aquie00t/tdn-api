/**
 * The projection of a post the feed ranker scores on.
 *
 * Deliberately much lighter than a full `Post`: the candidate pool is a few
 * hundred rows per feed build, and hydrating each one with its author, tags
 * and quote card only to throw most of them away would cost more than the
 * ranking saves. Only the page that survives ranking is hydrated, by id.
 */
export interface FeedCandidate {
    /** The post's unique identifier. */
    id: string;

    /** The id of the account that published it. */
    authorId: string;

    /** Detected content language, null when the detector could not tell. */
    lang: string | null;

    /** When the post was published; the input to time decay. */
    createdAt: Date;

    /** Denormalised like count. */
    likeCount: number;

    /** Denormalised comment count. */
    commentCount: number;

    /** Denormalised quote count. */
    quoteCount: number;
}
