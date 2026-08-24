import type { ArticleStatus } from "@core/domain/enums";

/**
 * Input for an author listing their own articles.
 */
export interface GetMyArticlesUseCaseInput {
    /**
     * The authenticated author.
     *
     * Always taken from the verified token by the controller, never from a
     * path or query parameter: this is the only read path that returns
     * unpublished articles.
     */
    authorId: string;

    /** 1-based page number */
    page?: number;

    /** Page size */
    limit?: number;

    /** Optional status filter */
    status?: ArticleStatus;
}
