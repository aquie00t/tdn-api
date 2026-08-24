import type { Article } from "@core/domain/entities/article.entity";

/**
 * Output of an author's own article list.
 */
export interface GetMyArticlesUseCaseOutput {
    /** The page of articles, drafts included */
    articles: Article[];

    /** Total number of articles owned by the author */
    total: number;
}
