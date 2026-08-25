/**
 * Repository interface for article bookmark operations.
 */
export interface IArticleBookmarkRepository {
    /**
     * Saves a bookmark for an article
     * @param articleId - The article being bookmarked
     * @param userId - The user creating the bookmark
     */
    save(articleId: string, userId: string): Promise<void>;

    /**
     * Removes a bookmark for an article
     * @param articleId - The article being unbookmarked
     * @param userId - The user removing the bookmark
     */
    remove(articleId: string, userId: string): Promise<void>;

    /**
     * Checks whether an article is bookmarked by a user
     * @param articleId - The article to check
     * @param userId - The user to check for
     * @returns True when the article is bookmarked
     */
    isBookmarked(articleId: string, userId: string): Promise<boolean>;
}
