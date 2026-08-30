import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { StoragePort } from "@core/ports/services/storage.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import { UnauthorizedActionError, NotFoundError } from "@core/errors";
import type { DeletePostUseCaseInput } from "./delete-post-usecase.input";
import type { CachePort } from "@core/ports/services/cache.port";
import type { TransactionPort } from "@core/ports/services/transaction.port";

/**
 * Use case for deleting a post.
 *
 * This use case handles the complete process of deleting a post including
 * media cleanup, cache invalidation, and permission validation.
 */
export class DeletePostUseCase {
    /**
     * Creates a new instance of DeletePostUseCase.
     *
     * @param postRepository - Repository for managing post data
     * @param storageService - Service for file storage operations
     * @param logger - Service for logging operations
     * @param cacheService - Service for cache operations
     * @param transactionService - Service for running the delete atomically
     */
    constructor(
        private readonly postRepository: IPostRepository,
        private readonly storageService: StoragePort,
        private readonly logger: LoggerPort,
        private readonly cacheService: CachePort,
        private readonly transactionService: TransactionPort,
    ) {}

    /**
     * Executes the post deletion process.
     *
     * @param input - Input containing post ID, user ID, and CDN base URL
     * @returns Promise<void> - Resolves when post deletion is complete
     *
     * @throws NotFoundError - When the post is not found
     * @throws UnauthorizedActionError - When user is not the post author
     *
     * @remarks
     * This method validates ownership, deletes associated media files,
     * clears cache entries, and removes the post from the database.
     * Media deletion errors are logged but don't prevent post deletion.
     *
     * Deleting a quote also gives the quoted post its count back, in the same
     * transaction as the delete so the two cannot come apart. Deleting a
     * quoted post needs no such care: its own quotes are cascaded away with
     * it, and no surviving row was counting them.
     */
    async execute(input: DeletePostUseCaseInput): Promise<void> {
        const post = await this.postRepository.findById(input.postId);

        if (!post) {
            throw new NotFoundError("Post Not Found.");
        }

        if (post.author.id !== input.userId) {
            throw new UnauthorizedActionError(
                "You can only delete your own posts.",
            );
        }

        if (post.hasMedia()) {
            for (const fullUrl of post.mediaUrls) {
                try {
                    const fileKey = fullUrl
                        .replace(`${input.cdnBaseUrl}/`, "")
                        .replace(`${input.cdnBaseUrl}`, "");

                    await this.storageService.delete(fileKey);
                } catch (error) {
                    this.logger.error(
                        { err: error, postId: post.id, targetUrl: fullUrl },
                        "When deleting mail, the connected media could not be deleted from AWS.",
                    );
                }
            }
        }

        await this.cacheService.deleteByPattern("posts:feed:*");

        await this.transactionService.runInTransaction(async (ctx) => {
            if (post.quotedPostId) {
                await ctx.postRepository.decrementQuoteCount(post.quotedPostId);
            }

            await ctx.postRepository.delete(input.postId);
        });
    }
}
