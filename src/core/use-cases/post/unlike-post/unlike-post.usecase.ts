import type { TransactionPort } from "@core/ports/services/transaction.port";
import { NotFoundError } from "@core/errors";
import type { UnlikePostUseCaseInput } from "./unlike-post-usecase.input";
import type { CachePort } from "@core/ports/services/cache.port";
import { NotificationType } from "@core/domain/enums/notification-type.enum";

/**
 * Use case for unliking a post
 *
 * Handles the business logic for removing a like relationship between a user and a post.
 * Validates that the post exists and that the user has previously liked the post before
 * removing the like relationship. Uses transactions for atomic operations.
 */
export class UnlikePostUseCase {
    /**
     * Creates a new UnlikePostUseCase instance
     * @param transactionService - Service for handling database transactions
     */
    constructor(
        private readonly transactionService: TransactionPort,
        private readonly cacheService: CachePort,
    ) {}

    /**
     * Executes the unlike post use case
     * @param input - Input containing post ID and user ID
     * @returns Promise<void>
     *
     * @throws NotFoundError - When the post is not found
     *
     * @remarks
     * This method first validates that the post exists, then checks if the user
     * has previously liked the post. If both conditions are met, it removes the
     * like relationship, decrements the like count and takes back the
     * notification the like had produced. If the user hasn't liked the post,
     * the operation is silently ignored (no error thrown).
     */
    async execute(input: UnlikePostUseCaseInput): Promise<void> {
        await this.transactionService.runInTransaction(async (ctx) => {
            const post = await ctx.postRepository.findById(input.postId);

            if (!post) {
                throw new NotFoundError("Post not found.");
            }

            const hasLiked = await ctx.postLikeRepository.isLiked(
                input.postId,
                input.userId,
            );

            if (hasLiked) {
                await ctx.postLikeRepository.unlike(input.postId, input.userId);
                await ctx.postLikeRepository.decrementLikeCount(input.postId);

                await ctx.notificationRepository.deleteByTarget({
                    recipientId: post.author.id,
                    issuerId: input.userId,
                    type: NotificationType.LIKE,
                    postId: input.postId,
                });
            }
        });
        await this.cacheService.deleteByPattern(
            `posts:feed:*user:${input.userId}*`,
        );
    }
}
