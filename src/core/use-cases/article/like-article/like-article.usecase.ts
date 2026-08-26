import type { TransactionPort } from "@core/ports/services/transaction.port";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import { Notification } from "@core/domain/entities/notification.entity";
import { NotificationType } from "@core/domain/enums/notification-type.enum";
import { NotFoundError } from "@core/errors";
import type { LikeArticleUseCaseInput } from "./like-article-usecase.input";

/**
 * Use case for liking an article.
 *
 * Liking is idempotent: a second like from the same user is a no-op rather
 * than an error, so a retried request cannot inflate the count.
 */
export class LikeArticleUseCase {
    /**
     * @param transactionService - Service for handling database transactions
     * @param realtimeService - Service for real-time notifications
     */
    constructor(
        private readonly transactionService: TransactionPort,
        private readonly realtimeService: RealtimePort,
    ) {}

    /**
     * Executes the like.
     *
     * @param input - The article and the user liking it
     * @throws NotFoundError - When the article does not exist or is not visible
     */
    async execute(input: LikeArticleUseCaseInput): Promise<void> {
        await this.transactionService.runInTransaction(async (ctx) => {
            const article = await ctx.articleRepository.findById(
                input.articleId,
            );

            // Unpublished articles are invisible to everyone but their author,
            // and answering anything other than 404 would confirm one exists.
            if (!article || !article.isPublished()) {
                throw new NotFoundError("Article not found.");
            }

            const alreadyLiked = await ctx.articleLikeRepository.isLiked(
                input.articleId,
                input.userId,
            );

            if (alreadyLiked) return;

            await ctx.articleLikeRepository.like(input.articleId, input.userId);
            await ctx.articleLikeRepository.incrementLikeCount(input.articleId);

            if (article.author.id !== input.userId) {
                const notification = Notification.create(
                    article.author.id,
                    input.userId,
                    NotificationType.LIKE,
                    { articleId: input.articleId },
                );

                await ctx.notificationRepository.create(notification);

                this.realtimeService.emitToUser(
                    article.author.id,
                    "new-notification",
                    {
                        type: NotificationType.LIKE,
                        issuerId: input.userId,
                        articleId: input.articleId,
                        articleSlug: article.slug,
                        referenceId: input.articleId,
                    },
                );
            }
        });
    }
}
