import type { PostCategory } from "@core/domain/enums/post-category-enum";

/**
 * Input for the public article list.
 *
 * There is no status filter: this list is published articles only, decided by
 * the repository rather than by the caller.
 */
export interface GetArticlesUseCaseInput {
    /** 1-based page number */
    page?: number;

    /** Page size */
    limit?: number;

    /** Restrict to articles carrying this tag */
    tag?: string;

    /** Restrict to articles written by this username */
    authorUsername?: string;

    /** Restrict to articles in any of these categories */
    categories?: PostCategory[];

    /** Restrict to authors the viewer follows; requires authentication */
    followedOnly?: boolean;

    /** The viewer, used for like and bookmark flags and for the cache key */
    currentUserId?: string;
}
