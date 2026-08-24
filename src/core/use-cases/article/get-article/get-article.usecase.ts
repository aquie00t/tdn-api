import type { Article } from "@core/domain/entities/article.entity";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import { NotFoundError } from "@core/errors";
import type { GetArticleUseCaseInput } from "./get-article-usecase.input";

/**
 * Use case for reading a single article by its slug.
 *
 * This is the second of the two layers keeping drafts private. The repository
 * returns an article of any status so an author can read their own draft back;
 * this use case decides who is allowed to see it.
 */
export class GetArticleUseCase {
    /**
     * Creates a new instance of GetArticleUseCase.
     *
     * @param articleRepository - Repository for reading articles
     */
    constructor(private readonly articleRepository: IArticleRepository) {}

    /**
     * Executes the lookup.
     *
     * @param input - The slug and the viewer
     * @returns The article, when the viewer may see it
     *
     * @throws NotFoundError - When no article matches, or the viewer may not
     * see it. Deliberately not a 403: a different status code for a draft that
     * exists would confirm the slug, which is the leak this prevents.
     */
    async execute(input: GetArticleUseCaseInput): Promise<Article> {
        const article = await this.articleRepository.findBySlug(
            input.slug,
            input.viewerId,
        );

        if (!article || !article.isVisibleTo(input.viewerId)) {
            throw new NotFoundError("Article not found.");
        }

        return article;
    }
}
