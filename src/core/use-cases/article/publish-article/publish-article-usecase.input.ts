/**
 * Input for publishing an article.
 */
export interface PublishArticleUseCaseInput {
    /** Identifier of the article to publish */
    articleId: string;

    /** The authenticated user, who must be the author */
    userId: string;
}
