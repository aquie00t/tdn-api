import type { TransactionPort } from "@core/ports/services/transaction.port";
import { NotFoundError } from "@core/errors";
import type { UnlikeArticleUseCaseInput } from "./unlike-article-usecase.input";

/**
 * Use case for removing a like from an article.
 *
 * Idempotent in the same way liking is: unliking something that was never
 * liked does nothing rather than failing, so the count cannot go negative.
 */
export class UnlikeArticleUseCase {
    /**
     * @param transactionService - Service for handling database transactions
     */
    constructor(private readonly transactionService: TransactionPort) {}

    /**
     * Executes the unlike.
     *
     * @param input - The article and the user removing their like
     * @throws NotFoundError - When the article does not exist or is not visible
     */
    async execute(input: UnlikeArticleUseCaseInput): Promise<void> {
        await this.transactionService.runInTransaction(async (ctx) => {
            const article = await ctx.articleRepository.findById(
                input.articleId,
            );

            if (!article || !article.isPublished()) {
                throw new NotFoundError("Article not found.");
            }

            const liked = await ctx.articleLikeRepository.isLiked(
                input.articleId,
                input.userId,
            );

            if (!liked) return;

            await ctx.articleLikeRepository.unlike(
                input.articleId,
                input.userId,
            );
            await ctx.articleLikeRepository.decrementLikeCount(input.articleId);
        });
    }
}
