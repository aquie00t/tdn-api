/**
 * Input for removing a like from an article.
 */
export interface UnlikeArticleUseCaseInput {
    /** The article being unliked */
    articleId: string;

    /** The authenticated user */
    userId: string;
}
