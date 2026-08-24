/**
 * Input for deleting an article.
 */
export interface DeleteArticleUseCaseInput {
    /** Identifier of the article to delete */
    articleId: string;

    /** The authenticated user, who must be the author */
    userId: string;
}
