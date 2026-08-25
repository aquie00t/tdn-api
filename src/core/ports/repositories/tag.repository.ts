/**
 * Represents a single trending tag item returned by the repository.
 */
export interface TrendItem {
    tag: string;

    /**
     * Posts carrying this tag.
     *
     * Keeps its original post-only meaning so existing clients reading it are
     * unaffected; articles are reported separately.
     */
    postCount: number;

    /** Published articles carrying this tag */
    articleCount: number;

    category: string | null;
}

/**
 * Represents a single tag search result.
 */
export interface TagSearchItem {
    name: string;

    /** Posts carrying this tag */
    postCount: number;

    /** Published articles carrying this tag */
    articleCount: number;

    category: string | null;
}

/**
 * Parameters for querying trending tags.
 */
export interface TrendingParams {
    limit: number;
    windowDays: number;
}

/**
 * Repository interface for tag-related queries.
 * Following Clean Architecture principles, this interface defines the contract
 * without exposing Prisma or any other persistence detail.
 */
export interface ITagRepository {
    /**
     * Returns the most-used tags within the given time window.
     *
     * Ordered by posts and published articles combined. Drafts never count:
     * an unpublished article must not be able to push its tag into a public
     * trend list.
     *
     * @param params - Limit and window size in days.
     */
    findTrending(params: TrendingParams): Promise<TrendItem[]>;

    /**
     * Searches tags by name prefix/substring, ordered by combined usage.
     * @param query - The search string to match against tag names.
     * @param limit - Maximum number of results to return. Defaults to 10.
     */
    search(query: string, limit?: number): Promise<TagSearchItem[]>;
}
