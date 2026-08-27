import type { TransactionPort } from "@core/ports/services/transaction.port";
import { NotFoundError } from "@core/errors";
import type { UnlikeCommentUseCaseInput } from "./unlike-comment-usecase.input";
import { NotificationType } from "@core/domain/enums/notification-type.enum";

/**
 * Use case for unliking a comment. This use case handles the logic for removing a like from a comment, including checking if the comment exists, verifying that the user has previously liked the comment, updating the like count, and ensuring that all operations are executed within a transaction to maintain data integrity.
 */
export class UnlikeCommentUseCase {
    /**
     * @param transactionService - Service for managing transactions, used to ensure that all operations related to unliking a comment are executed atomically and to maintain data integrity in case of errors during the process
     */
    constructor(private readonly transactionService: TransactionPort) {}
    /**
     * Executes the use case to unlike a comment based on the provided input. This method performs several steps: it checks if the comment exists, verifies that the user has previously liked the comment, removes the like and decrements the like count, all within a transaction to ensure data consistency and integrity throughout the process.
     * @param input - The input containing the comment ID and user ID necessary to perform the unlike action, which includes identifying the comment to be unliked and the user performing the unlike, ensuring that the correct data is updated based on the user's previous interaction with the comment
     * @throws NotFoundError if the comment does not exist, ensuring that an appropriate error is thrown when attempting to unlike a non-existent comment
     * @returns A promise that resolves when the unlike action is completed, including all necessary updates, without returning any specific data as the result of the operation
     */
    async execute(input: UnlikeCommentUseCaseInput): Promise<void> {
        await this.transactionService.runInTransaction(async (ctx) => {
            const comment = await ctx.commentRepository.findById(
                input.commentId,
            );
            if (!comment) throw new NotFoundError("Comment not found.");

            const alreadyLiked = await ctx.commentRepository.hasUserLiked(
                input.commentId,
                input.userId,
            );
            if (!alreadyLiked) return;

            await ctx.commentRepository.removeLike(
                input.commentId,
                input.userId,
            );
            await ctx.commentRepository.decrementLikeCount(input.commentId);

            await ctx.notificationRepository.deleteByTarget({
                recipientId: comment.authorId,
                issuerId: input.userId,
                type: NotificationType.COMMENT_LIKE,
                commentId: input.commentId,
                postId: comment.postId ?? undefined,
                articleId: comment.articleId ?? undefined,
            });
        });
    }
}
