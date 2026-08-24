/**
 * Input for archiving an article.
 */
export interface ArchiveArticleUseCaseInput {
    /** Identifier of the article to archive */
    articleId: string;

    /** The authenticated user, who must be the author */
    userId: string;
}
