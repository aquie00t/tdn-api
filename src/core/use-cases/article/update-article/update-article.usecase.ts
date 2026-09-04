import type { IMediaAssetRepository } from "@core/ports/repositories/media-asset.repository";
import { MediaOwnerKind } from "@core/domain/enums";
import { resolveCoverSensitivity } from "@core/use-cases/shared/media/resolve-cover-sensitivity";
import type { Article } from "@core/domain/entities/article.entity";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { CachePort } from "@core/ports/services/cache.port";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { NotifyMentionedUsersUseCase } from "@core/use-cases/notification/notify-mentioned-users";
import { resolveMentions } from "@core/use-cases/shared/mentions/resolve-mentions";
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
     * @param userRepository - Repository the @handles in the body are resolved against
     * @param notifyMentionedUsersUseCase - Use case that tells the users newly named in the body
     * @param logger - Service for logging operations
     */
    constructor(
        private readonly articleRepository: IArticleRepository,
        private readonly cacheService: CachePort,
        private readonly mediaAssetRepository: IMediaAssetRepository,
        private readonly userRepository: IUserRepository,
        private readonly notifyMentionedUsersUseCase: NotifyMentionedUsersUseCase,
        private readonly logger: LoggerPort,
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

        const body =
            input.body === undefined ? undefined : normalizeBody(input.body);

        // The body is the only source of mentions, so an edit that leaves it
        // alone leaves them alone too. Read before applyEdit, since that is
        // what replaces the set.
        const previouslyMentionedIds = new Set(
            article.mentions.map((mention) => mention.id),
        );

        const mentions =
            body === undefined
                ? undefined
                : await resolveMentions({
                      content: body,
                      userRepository: this.userRepository,
                  });

        article.applyEdit({
            title:
                input.title === undefined
                    ? undefined
                    : normalizeTitle(input.title),
            body,
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
            mentions,
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
            this.notifyNewlyMentioned(updated, previouslyMentionedIds);
        }

        return updated;
    }

    /**
     * Tells the people this edit newly named that the article mentions them.
     *
     * Only the difference is notified. Re-saving a published article must not
     * ping everyone it already named again, and someone whose handle stayed in
     * the body across ten edits heard about it on the first one.
     *
     * @param article - The article as it now stands
     * @param previouslyMentionedIds - Who it named before the edit
     */
    private notifyNewlyMentioned(
        article: Article,
        previouslyMentionedIds: Set<string>,
    ): void {
        const newlyMentionedIds = article.mentions
            .map((mention) => mention.id)
            .filter((id) => !previouslyMentionedIds.has(id));

        if (newlyMentionedIds.length === 0) return;

        void this.notifyMentionedUsersUseCase
            .execute({
                issuerId: article.author.id,
                mentionedUserIds: newlyMentionedIds,
                target: { articleId: article.id },
                articleSlug: article.slug,
            })
            .catch((err: unknown) => {
                this.logger.error(
                    { err, articleId: article.id },
                    "Failed to notify the mentioned users",
                );
            });
    }
}
