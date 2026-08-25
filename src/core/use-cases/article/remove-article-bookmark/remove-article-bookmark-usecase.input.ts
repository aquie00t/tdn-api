/**
 * Input for removing an article bookmark.
 */
export interface RemoveArticleBookmarkUseCaseInput {
    /** The article being unbookmarked */
    articleId: string;

    /** The authenticated user */
    userId: string;
}
