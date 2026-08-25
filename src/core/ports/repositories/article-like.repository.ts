/**
 * Repository interface for managing article like relationships.
 */
export interface IArticleLikeRepository {
    /**
     * Creates a like relationship between a user and an article
     * @param articleId - The unique identifier of the article
     * @param userId - The unique identifier of the user
     */
    like(articleId: string, userId: string): Promise<void>;

    /**
     * Checks whether a user has already liked an article
     * @param articleId - The unique identifier of the article
     * @param userId - The unique identifier of the user
     * @returns True when the user has liked the article
     */
    isLiked(articleId: string, userId: string): Promise<boolean>;

    /**
     * Removes a like relationship between a user and an article
     * @param articleId - The unique identifier of the article
     * @param userId - The unique identifier of the user
     */
    unlike(articleId: string, userId: string): Promise<void>;

    /**
     * Increments the cached like count of an article
     * @param articleId - The article to update
     */
    incrementLikeCount(articleId: string): Promise<void>;

    /**
     * Decrements the cached like count of an article
     * @param articleId - The article to update
     */
    decrementLikeCount(articleId: string): Promise<void>;
}
