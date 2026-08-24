import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { CachePort } from "@core/ports/services/cache.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { StoragePort } from "@core/ports/services/storage.port";
import type { DeleteArticleUseCaseInput } from "./delete-article-usecase.input";
import { loadOwnArticle } from "../article-access";

/** Cache key pattern covering every cached public article list. */
const ARTICLE_LIST_CACHE_PATTERN = "articles:list:*";

/**
 * Use case for deleting an article.
 *
 * Likes, bookmarks and tag links are removed by the database cascade. The cover
 * image is not, so it is deleted from storage here; a failure there is logged
 * and ignored, because leaving a stray object behind is better than refusing to
 * delete the article the author asked to remove.
 */
export class DeleteArticleUseCase {
    /**
     * Creates a new instance of DeleteArticleUseCase.
     *
     * @param articleRepository - Repository for managing article data
     * @param storageService - Object storage holding the cover image
     * @param cacheService - Cache used by the public article list
     * @param logger - Logger for non-fatal storage failures
     */
    constructor(
        private readonly articleRepository: IArticleRepository,
        private readonly storageService: StoragePort,
        private readonly cacheService: CachePort,
        private readonly logger: LoggerPort,
    ) {}

    /**
     * Executes the article deletion.
     *
     * @param input - The article and its author
     *
     * @throws NotFoundError - When the article does not exist or is not visible
     * @throws UnauthorizedActionError - When the caller is not the author
     */
    async execute(input: DeleteArticleUseCaseInput): Promise<void> {
        const article = await loadOwnArticle(
            this.articleRepository,
            input.articleId,
            input.userId,
        );

        const wasPublished = article.isPublished();

        if (article.coverImageKey) {
            try {
                await this.storageService.delete(article.coverImageKey);
            } catch (error) {
                this.logger.error(
                    {
                        err: error,
                        articleId: article.id,
                        coverImageKey: article.coverImageKey,
                    },
                    "Cover image could not be deleted from object storage.",
                );
            }
        }

        await this.articleRepository.delete(input.articleId);

        if (wasPublished) {
            await this.cacheService.deleteByPattern(ARTICLE_LIST_CACHE_PATTERN);
        }
    }
}
