import type { Article } from "@core/domain/entities/article.entity";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { CachePort } from "@core/ports/services/cache.port";
import { InvalidArticleStateError } from "@core/errors";
import type { ArchiveArticleUseCaseInput } from "./archive-article-usecase.input";
import { loadOwnArticle } from "../article-access";

/** Cache key pattern covering every cached public article list. */
const ARTICLE_LIST_CACHE_PATTERN = "articles:list:*";

/**
 * Use case for archiving an article.
 *
 * An archived article keeps its slug so the URL stays reserved, but becomes
 * invisible to everyone except its author.
 */
export class ArchiveArticleUseCase {
    /**
     * Creates a new instance of ArchiveArticleUseCase.
     *
     * @param articleRepository - Repository for managing article data
     * @param cacheService - Cache used by the public article list
     */
    constructor(
        private readonly articleRepository: IArticleRepository,
        private readonly cacheService: CachePort,
    ) {}

    /**
     * Executes the archive transition.
     *
     * @param input - The article and its author
     * @returns The archived article
     *
     * @throws NotFoundError - When the article does not exist or is not visible
     * @throws UnauthorizedActionError - When the caller is not the author
     * @throws InvalidArticleStateError - When the article was never published
     */
    async execute(input: ArchiveArticleUseCaseInput): Promise<Article> {
        const article = await loadOwnArticle(
            this.articleRepository,
            input.articleId,
            input.userId,
        );

        if (!article.canArchive()) {
            throw new InvalidArticleStateError(
                "Only a published article can be archived.",
            );
        }

        article.archive();
        const updated = await this.articleRepository.update(article);

        await this.cacheService.deleteByPattern(ARTICLE_LIST_CACHE_PATTERN);

        return updated;
    }
}
