import type { Article } from "@core/domain/entities/article.entity";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { CachePort } from "@core/ports/services/cache.port";
import { InvalidArticleStateError } from "@core/errors";
import type { PublishArticleUseCaseInput } from "./publish-article-usecase.input";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { NotifyMentionedUsersUseCase } from "@core/use-cases/notification/notify-mentioned-users";
import { loadOwnArticle } from "../article-access";

/** Cache key pattern covering every cached public article list. */
const ARTICLE_LIST_CACHE_PATTERN = "articles:list:*";

/**
 * Use case for publishing an article.
 *
 * Publishing is the moment an article becomes readable by everyone, so it is
 * also the moment the cached public list stops being accurate.
 */
export class PublishArticleUseCase {
    /**
     * Creates a new instance of PublishArticleUseCase.
     *
     * @param articleRepository - Repository for managing article data
     * @param cacheService - Cache used by the public article list
     * @param notifyMentionedUsersUseCase - Use case that tells the users named in the body
     * @param logger - Service for logging operations
     */
    constructor(
        private readonly articleRepository: IArticleRepository,
        private readonly cacheService: CachePort,
        private readonly notifyMentionedUsersUseCase: NotifyMentionedUsersUseCase,
        private readonly logger: LoggerPort,
    ) {}

    /**
     * Executes the publish transition.
     *
     * @param input - The article and its author
     * @returns The published article
     *
     * @throws NotFoundError - When the article does not exist or is not visible
     * @throws UnauthorizedActionError - When the caller is not the author
     * @throws InvalidArticleStateError - When the article is already published
     *
     * @remarks
     * Publishing is where an article's mentions become notifications, because
     * it is the first moment the named people could read what names them.
     * `canPublish()` makes the transition happen once, which is also what
     * keeps this fan-out from repeating.
     */
    async execute(input: PublishArticleUseCaseInput): Promise<Article> {
        const article = await loadOwnArticle(
            this.articleRepository,
            input.articleId,
            input.userId,
        );

        if (!article.canPublish()) {
            throw new InvalidArticleStateError(
                "This article is already published.",
            );
        }

        article.publish();
        const updated = await this.articleRepository.update(article);

        await this.cacheService.deleteByPattern(ARTICLE_LIST_CACHE_PATTERN);

        if (updated.mentions.length > 0) {
            void this.notifyMentionedUsersUseCase
                .execute({
                    issuerId: updated.author.id,
                    mentionedUserIds: updated.mentions.map(
                        (mention) => mention.id,
                    ),
                    target: { articleId: updated.id },
                    articleSlug: updated.slug,
                })
                .catch((err: unknown) => {
                    this.logger.error(
                        { err, articleId: updated.id },
                        "Failed to notify the mentioned users",
                    );
                });
        }

        return updated;
    }
}
