import type { TransactionPort } from "@core/ports/services/transaction.port";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import { Notification } from "@core/domain/entities/notification.entity";
import { NotificationType } from "@core/domain/enums/notification-type.enum";
import { NotFoundError } from "@core/errors";
import type { LikePostUseCaseInput } from "./like-post-usecase.input";
import type { CachePort } from "@core/ports/services/cache.port";

/**
 * Use case for liking a post
 *
 * Handles the business logic for creating a like relationship between a user and a post.
 * Also manages notification creation and real-time updates when a post is liked by someone
 * other than the post author. Uses transactions for atomic operations.
 */
export class LikePostUseCase {
    /**
     * Creates a new LikePostUseCase instance
     * @param transactionService - Service for handling database transactions
     * @param realtimeService - Service for real-time communication
     */
    constructor(
        private readonly transactionService: TransactionPort,
        private readonly realtimeService: RealtimePort,
        private readonly cacheService: CachePort,
    ) {}

    /**
     * Executes the like post use case
     * @param input - Input containing post ID and user ID
     * @returns Promise<void>
     */
    async execute(input: LikePostUseCaseInput): Promise<void> {
        await this.transactionService.runInTransaction(async (ctx) => {
            const post = await ctx.postRepository.findById(input.postId);

            if (!post) throw new NotFoundError("Post not found.");

            const alreadyLiked = await ctx.postLikeRepository.isLiked(
                input.postId,
                input.userId,
            );

            if (alreadyLiked) return;

            await ctx.postLikeRepository.like(input.postId, input.userId);
            await ctx.postLikeRepository.incrementLikeCount(input.postId);

            if (post.author.id !== input.userId) {
                const notification = Notification.create(
                    post.author.id,
                    input.userId,
                    NotificationType.LIKE,
                    { postId: input.postId },
                );

                await ctx.notificationRepository.create(notification);

                this.realtimeService.emitToUser(
                    post.author.id,
                    "new-notification",
                    {
                        type: NotificationType.LIKE,
                        issuerId: input.userId,
                        postId: input.postId,
                        referenceId: input.postId,
                    },
                );
            }
        });
        await this.cacheService.deleteByPattern(
            `posts:feed:*user:${input.userId}*`,
        );
    }
}
