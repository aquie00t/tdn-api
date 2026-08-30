/**
 * The snapshot of a post as it appears embedded inside a quote post.
 *
 * Deliberately narrower than {@link PostProps}: a quote card shows who wrote
 * the quoted post, what it said and when, and nothing else. Keeping it a
 * separate shape rather than nesting `PostProps` inside itself is what stops
 * the embed from recursing - a quote of a quote carries only the post it
 * quotes, never that post's own quote.
 */
export interface QuotedPostSnapshot {
    /** The unique identifier of the quoted post */
    id: string;

    /** The content text of the quoted post */
    content: string;

    /** Media attached to the quoted post */
    mediaUrls: string[];

    /** When the quoted post was created */
    createdAt: Date;

    /** The author of the quoted post */
    author: {
        /** The unique identifier of the quoted post's author */
        id: string;

        /** Handle of the quoted post's author */
        username: string;

        /** Optional avatar URL of the author for display purposes */
        avatarUrl?: string;

        /** Optional display name of the author */
        fullName?: string;
    };
}
