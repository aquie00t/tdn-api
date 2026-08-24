import type { Article } from "@core/domain/entities/article.entity";

/**
 * Output of the public article list.
 */
export interface GetArticlesUseCaseOutput {
    /** The page of articles */
    articles: Article[];

    /** Total number of articles matching the filters */
    total: number;
}
