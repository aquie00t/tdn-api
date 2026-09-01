import type { IMediaAssetRepository } from "@core/ports/repositories/media-asset.repository";
import { MediaOwnerKind } from "@core/domain/enums";
import { resolveCoverSensitivity } from "@core/use-cases/shared/media/resolve-cover-sensitivity";
import type { Article } from "@core/domain/entities/article.entity";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { CachePort } from "@core/ports/services/cache.port";
import type { UpdateArticleUseCaseInput } from "./update-article-usecase.input";
import { loadOwnArticle } from "../article-access";
import {
    normalizeBody,
    normalizeTags,
    normalizeTitle,
    validateCoverImageKey,
} from "../article-input";

/** Cache key pattern covering every cached public article list. */
const ARTICLE_LIST_CACHE_PATTERN = "articles:list:*";

/**
 * Use case for editing an article.
 *
 * Only the author may edit, and the cached public list is invalidated only when
 * the edited article is actually published: a draft is never in that cache.
 */
export class UpdateArticleUseCase {
    /**
     * Creates a new instance of UpdateArticleUseCase.
     *
     * @param articleRepository - Repository for managing article data
     * @param cacheService - Cache used by the public article list
     * @param mediaAssetRepository - Repository holding the cover's moderation verdict
     */
    constructor(
        private readonly articleRepository: IArticleRepository,
        private readonly cacheService: CachePort,
        private readonly mediaAssetRepository: IMediaAssetRepository,
    ) {}

    /**
     * Executes the article edit.
     *
     * @param input - The article, its author and the fields to change
     * @returns The updated article
     *
     * @throws NotFoundError - When the article does not exist or is not visible
     * @throws UnauthorizedActionError - When the caller is not the author
     * @throws BadRequestError - When any supplied field is invalid
     */
    async execute(input: UpdateArticleUseCaseInput): Promise<Article> {
        const article = await loadOwnArticle(
            this.articleRepository,
            input.articleId,
            input.userId,
        );

        const coverImageKey =
            input.coverImageKey === undefined
                ? undefined
                : validateCoverImageKey(input.coverImageKey, input.userId);

        article.applyEdit({
            title:
                input.title === undefined
                    ? undefined
                    : normalizeTitle(input.title),
            body:
                input.body === undefined
                    ? undefined
                    : normalizeBody(input.body),
            excerpt: input.excerpt,
            coverImageKey,
            // Recomputed only when the cover itself changed, and always then:
            // swapping a borderline cover for a clean one has to clear the
            // flag, or the article stays blurred forever.
            isSensitive:
                coverImageKey === undefined
                    ? undefined
                    : await resolveCoverSensitivity(
                          coverImageKey,
                          this.mediaAssetRepository,
                      ),
            coverImageAlt: input.coverImageAlt,
            tags:
                input.tags === undefined
                    ? undefined
                    : normalizeTags(input.tags),
            categories: input.categories,
        });

        const updated = await this.articleRepository.update(article);

        if (coverImageKey !== undefined) {
            // The cover changed, so whatever was attached before is superseded.
            // Releasing it first keeps "attached" meaning "in use", which is
            // what a storage purge would have to rely on.
            await this.mediaAssetRepository.detachFromOwner(
                MediaOwnerKind.ARTICLE,
                updated.id,
            );

            if (coverImageKey) {
                await this.mediaAssetRepository.attachToOwner(
                    [coverImageKey],
                    MediaOwnerKind.ARTICLE,
                    updated.id,
                );
            }
        }

        if (updated.isPublished()) {
            await this.cacheService.deleteByPattern(ARTICLE_LIST_CACHE_PATTERN);
        }

        return updated;
    }
}
