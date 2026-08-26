import type { TransactionPort } from "@core/ports/services/transaction.port";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import { NotFoundError } from "@core/errors";
import { Notification } from "@core/domain/entities/notification.entity";
import { NotificationType } from "@core/domain/enums/notification-type.enum";
import type { LikeCommentUseCaseInput } from "./like-comment-usecase.input";

/**
 * Use case for liking a comment. This use case handles the logic for adding a like to a comment, including checking if the comment exists, verifying that the user has not already liked the comment, updating the like count, and creating a notification for the comment author if the liker is not the author. The use case runs within a transaction to ensure data consistency and emits a real-time event to notify the comment author of the new like.
 */
export class LikeCommentUseCase {
    /**
     * @param transactionService - Service for managing transactions, used to ensure that all operations related to liking a comment are executed atomically and to maintain data integrity in case of errors during the process
     * @param realtimeService - Service for emitting real-time events, used to notify the comment author of a new like through a real-time notification when their comment receives a like from another user
     */
    constructor(
        private readonly transactionService: TransactionPort,
        private readonly realtimeService: RealtimePort,
    ) {}
    /**
     * Executes the use case to like a comment based on the provided input. This method performs several steps: it checks if the comment exists, verifies that the user has not already liked the comment, adds the like and increments the like count, and if the liker is not the author of the comment, it creates a notification for the author and emits a real-time event to notify them of the new like.
     * @param input - The input containing the comment ID and user ID necessary to perform the like action, which includes identifying the comment to be liked and the user performing the like, ensuring that the correct data is updated and that notifications are sent to the appropriate users based on their interactions with the comment
     * @throws NotFoundError if the comment does not exist, ensuring that an appropriate error is thrown when attempting to like a non-existent comment
     * @returns A promise that resolves when the like action is completed, including all necessary updates and notifications, without returning any specific data as the result of the operation
     */
    async execute(input: LikeCommentUseCaseInput): Promise<void> {
        await this.transactionService.runInTransaction(async (ctx) => {
            const comment = await ctx.commentRepository.findById(
                input.commentId,
            );
            if (!comment) throw new NotFoundError("Comment not found.");

            const alreadyLiked = await ctx.commentRepository.hasUserLiked(
                input.commentId,
                input.userId,
            );
            if (alreadyLiked) return;

            await ctx.commentRepository.addLike(input.commentId, input.userId);
            await ctx.commentRepository.incrementLikeCount(input.commentId);

            if (comment.authorId !== input.userId) {
                const notification = Notification.create(
                    comment.authorId,
                    input.userId,
                    NotificationType.COMMENT_LIKE,
                    {
                        commentId: input.commentId,
                        postId: comment.postId ?? undefined,
                        articleId: comment.articleId ?? undefined,
                    },
                );

                await ctx.notificationRepository.create(notification);

                this.realtimeService.emitToUser(
                    comment.authorId,
                    "new-notification",
                    {
                        type: NotificationType.COMMENT_LIKE,
                        issuerId: input.userId,
                        commentId: input.commentId,
                        postId: comment.postId ?? undefined,
                        articleId: comment.articleId ?? undefined,
                        referenceId: input.commentId,
                    },
                );
            }
        });
    }
}
