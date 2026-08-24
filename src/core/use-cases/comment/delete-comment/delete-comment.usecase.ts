import type { TransactionPort } from "@core/ports/services/transaction.port";
import type { CachePort } from "@core/ports/services/cache.port";
import { NotFoundError, ForbiddenError } from "@core/errors";
import type { DeleteCommentUseCaseInput } from "./delete-comment-usecase.input";

/**
 * Use case for deleting an existing comment. This use case ensures that the comment exists and that the user requesting the deletion is the author of the comment. If the comment has a parent comment, it also decrements the replies count of the parent comment. Finally, it deletes the comment and decrements the comments count of the associated post, while also clearing relevant cache entries to maintain data consistency.
 */
export class DeleteCommentUseCase {
    /**
     * @param transactionService - Service for managing database transactions, used to ensure that all operations related to deleting a comment are executed atomically
     * @param cacheService - Service for managing cache, used to clear relevant cache entries after a comment is deleted to maintain data consistency
     */
    constructor(
        private readonly transactionService: TransactionPort,
        private readonly cacheService: CachePort,
    ) {}
    /**
     * Executes the use case to delete a comment based on the provided input
     * @param input - The input containing the comment ID and user ID to identify which comment to delete and to verify permissions
     * @throws NotFoundError if the comment does not exist
     * @throws ForbiddenError if the user requesting the deletion is not the author of the comment
     * @returns void if the comment is successfully deleted
     */
    async execute(input: DeleteCommentUseCaseInput): Promise<void> {
        await this.transactionService.runInTransaction(async (ctx) => {
            const comment = await ctx.commentRepository.findById(
                input.commentId,
            );

            if (!comment) {
                throw new NotFoundError("Comment not found.");
            }

            if (comment.authorId !== input.userId) {
                throw new ForbiddenError("This comment is not yours.");
            }

            if (comment.parentId) {
                await ctx.commentRepository.decrementRepliesCount(
                    comment.parentId,
                );
            }

            const target = comment.target;

            await ctx.commentRepository.delete(input.commentId);

            // Articles derive their comment count from a relation count, so
            // there is no counter to maintain. Posts keep the existing
            // behaviour, drift and all: fixing that is a separate change.
            if (target.type === "POST") {
                await ctx.postRepository.decrementCommentsCount(target.id);
            }
        });

        try {
            await this.cacheService.deleteByPattern("posts:feed:*");
        } catch {
            // Cache invalidation failure is non-critical; comment is already deleted.
        }
    }
}
