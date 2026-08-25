/**
 * Input for liking an article.
 */
export interface LikeArticleUseCaseInput {
    /** The article being liked */
    articleId: string;

    /** The authenticated user */
    userId: string;
}
