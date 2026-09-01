/**
 * Use case for removing a bookmark from a post
 */
import type { TransactionPort } from "@core/ports/services/transaction.port";
import { NotFoundError } from "@core/errors";
import type { RemoveBookmarkInput } from "./remove-bookmark-usecase.input";

export class RemoveBookmarkUseCase {
    /**
     * Creates a new RemoveBookmarkUseCase instance
     * @param transactionService - Transaction service for database operations
     */
    constructor(private readonly transactionService: TransactionPort) {}

    /**
     * Executes the bookmark removal use case
     * @param input - Input containing post ID and user ID
     * @returns Promise that resolves when bookmark is removed
     * @throws NotFoundError if the post does not exist
     */
    async execute(input: RemoveBookmarkInput): Promise<void> {
        let bookmarkRemoved = false;

        await this.transactionService.runInTransaction(async (ctx) => {
            const post = await ctx.postRepository.findById(input.postId);
            if (!post) {
                throw new NotFoundError("Post not found.");
            }

            const hasBookmark = await ctx.bookmarkRepository.isBookmarked(
                input.postId,
                input.userId,
            );

            if (hasBookmark) {
                await ctx.bookmarkRepository.remove(input.postId, input.userId);
                bookmarkRemoved = true;
            }
        });

        if (!bookmarkRemoved) return;

        // The feed cache holds only the ranked order of post ids; isLiked and
        // isBookmarked are read fresh on every page. Purging the viewer's
        // ranked order here would rebuild it mid-scroll and shift every page
        // under them, to refresh a flag that was never stale.
    }
}
