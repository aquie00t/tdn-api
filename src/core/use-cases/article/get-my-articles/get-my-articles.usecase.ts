import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { GetMyArticlesUseCaseInput } from "./get-my-articles-usecase.input";
import type { GetMyArticlesUseCaseOutput } from "./get-my-articles-usecase.output";

/** Default page size when the caller does not ask for one. */
const DEFAULT_LIMIT = 10;

/**
 * Use case for an author reading their own articles, drafts included.
 *
 * This use case deliberately has no cache dependency. Sharing a cache with the
 * public list is exactly how a draft leaks into it, so the ability is not
 * present rather than merely unused.
 */
export class GetMyArticlesUseCase {
    /**
     * Creates a new instance of GetMyArticlesUseCase.
     *
     * @param articleRepository - Repository for reading articles
     */
    constructor(private readonly articleRepository: IArticleRepository) {}

    /**
     * Executes the query.
     *
     * @param input - The author, pagination and an optional status filter
     * @returns The page of articles and the total count
     */
    async execute(
        input: GetMyArticlesUseCaseInput,
    ): Promise<GetMyArticlesUseCaseOutput> {
        return await this.articleRepository.findByAuthorId({
            authorId: input.authorId,
            page: input.page ?? 1,
            limit: input.limit ?? DEFAULT_LIMIT,
            status: input.status,
        });
    }
}
