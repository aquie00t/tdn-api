/**
 * Use case for creating a bookmark on a post
 */
import type { TransactionPort } from "@core/ports/services/transaction.port";
import { NotFoundError } from "@core/errors";
import type { CreateBookmarkInput } from "./create-bookmark-usecase.input";

export class CreateBookmarkUseCase {
    /**
     * Creates a new CreateBookmarkUseCase instance
     * @param transactionService - Transaction service for database operations
     */
    constructor(private readonly transactionService: TransactionPort) {}

    /**
     * Executes the bookmark creation use case
     * @param input - Input containing post ID and user ID
     * @returns Promise that resolves when bookmark is created
     * @throws NotFoundError if the post does not exist
     */
    async execute(input: CreateBookmarkInput): Promise<void> {
        let bookmarkCreated = false;

        await this.transactionService.runInTransaction(async (ctx) => {
            const post = await ctx.postRepository.findById(input.postId);
            if (!post) {
                throw new NotFoundError("Post not found.");
            }

            const alreadyBookmarked = await ctx.bookmarkRepository.isBookmarked(
                input.postId,
                input.userId,
            );

            if (alreadyBookmarked) return;

            await ctx.bookmarkRepository.save(input.postId, input.userId);
            bookmarkCreated = true;
        });

        if (!bookmarkCreated) return;

        // The feed cache holds only the ranked order of post ids; isLiked and
        // isBookmarked are read fresh on every page. Purging the viewer's
        // ranked order here would rebuild it mid-scroll and shift every page
        // under them, to refresh a flag that was never stale.
    }
}
