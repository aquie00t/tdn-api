/**
 * Input for bookmarking an article.
 */
export interface SaveArticleBookmarkUseCaseInput {
    /** The article being bookmarked */
    articleId: string;

    /** The authenticated user */
    userId: string;
}
