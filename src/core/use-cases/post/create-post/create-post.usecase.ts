import type { TransactionPort } from "@core/ports/services/transaction.port";
import type { CreatePostInput } from "./create-post-usecase.input";
import type { CachePort } from "@core/ports/services/cache.port";
import { Post } from "@core/domain/entities/post.entity";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { NotifyNewPostUseCase } from "@core/use-cases/notification/notify-new-post";
import type { NotifyQuotedAuthorUseCase } from "@core/use-cases/notification/notify-quoted-author";
import { PostType } from "@core/domain/enums";
import { ForbiddenError } from "@core/errors/common/forbidden.error";
import { NotFoundError } from "@core/errors/common/not-found.error";
import { BadRequestError } from "@core/errors/common/bad-request.error";

/**
 * Use case for creating a new post.
 *
 * This use case handles the process of creating a post with optional media
 * and invalidating related cache entries.
 */
export class CreatePostUseCase {
    /**
     * Creates a new instance of CreatePostUseCase.
     *
     * @param transactionService - Service for running the write atomically
     * @param cacheService - Service for cache operations
     * @param userRepository - Repository for managing user data
     * @param notifyNewPostUseCase - Use case that fans the post out to followers
     * @param notifyQuotedAuthorUseCase - Use case that tells an author their post was quoted
     * @param logger - Service for logging operations
     */
    constructor(
        private readonly transactionService: TransactionPort,
        private readonly cacheService: CachePort,
        private readonly userRepository: IUserRepository,
        private readonly notifyNewPostUseCase: NotifyNewPostUseCase,
        private readonly notifyQuotedAuthorUseCase: NotifyQuotedAuthorUseCase,
        private readonly logger: LoggerPort,
    ) {}

    /**
     * Executes the post creation process.
     *
     * @param input - Input containing post content, type, author ID, media URLs
     * and the optional id of the post being quoted
     * @returns Promise<void> - Resolves when post creation is complete
     *
     * @throws BadRequestError - When an empty post quotes nothing
     * @throws NotFoundError - When quotedPostId names a post that does not exist
     *
     * @remarks
     * This method creates a new post entity, saves it to the database,
     * and clears any cached feed data to ensure consistency.
     *
     * Content may be empty only when the post quotes another one: a quote with
     * nothing added is a pure repost, while an empty post that quotes nothing
     * is nothing at all. The rule spans two fields, which is why it lives here
     * rather than in the request schema.
     *
     * The post and the quoted post's counter are written in one transaction:
     * a post that exists without having been counted would leave the quote
     * badge permanently short, and there is no cheap way to notice afterwards.
     * The quoted post is resolved inside that transaction too, so a quote can
     * never be stored against an id that is already gone - the foreign key
     * would reject it as well, but a 404 says what happened and a constraint
     * violation does not.
     *
     * The bot check stays outside the transaction because it only reads, and
     * so do the cache purge and the fan-out, which must not hold the write
     * open or roll it back.
     *
     * Followers and, for a quote, the quoted author are notified after the
     * post is committed, deliberately outside the caller's critical path: the
     * post is the thing worth keeping, so a notification failure is logged
     * rather than allowed to fail the request or roll the write back.
     */
    async execute(input: CreatePostInput): Promise<Post> {
        if (input.content.length === 0 && !input.quotedPostId) {
            throw new BadRequestError("Post content cannot be empty.");
        }

        if ([PostType.SYSTEM_UPDATE, PostType.TECH_NEWS].includes(input.type)) {
            const author = await this.userRepository.findById(input.authorId);
            if (!author) throw new NotFoundError("User not found.");
            if (!author.canCreatePostType(input.type)) {
                throw new ForbiddenError(
                    "Only bot accounts can create this post type.",
                );
            }
        }

        const rawPost = await this.transactionService.runInTransaction(
            async (ctx) => {
                if (input.quotedPostId) {
                    const quoted = await ctx.postRepository.findById(
                        input.quotedPostId,
                    );
                    if (!quoted) {
                        throw new NotFoundError("Quoted post not found.");
                    }
                }

                const post = Post.create(
                    input.content,
                    input.type,
                    input.authorId,
                    input.mediaUrls || [],
                    input.categories || [],
                    input.quotedPostId,
                );

                const created = await ctx.postRepository.create(post);

                if (input.quotedPostId) {
                    await ctx.postRepository.incrementQuoteCount(
                        input.quotedPostId,
                    );
                }

                return created;
            },
        );

        await this.cacheService.deleteByPattern("posts:feed:*");

        void this.notifyNewPostUseCase
            .execute({
                postId: rawPost.id,
                authorId: input.authorId,
                postType: input.type,
            })
            .catch((err: unknown) => {
                this.logger.error(
                    { err, postId: rawPost.id },
                    "Failed to notify followers of a new post",
                );
            });

        if (input.quotedPostId) {
            void this.notifyQuotedAuthorUseCase
                .execute({
                    quotePostId: rawPost.id,
                    quotedPostId: input.quotedPostId,
                    issuerId: input.authorId,
                })
                .catch((err: unknown) => {
                    this.logger.error(
                        { err, postId: rawPost.id },
                        "Failed to notify the quoted author",
                    );
                });
        }

        return rawPost;
    }
}
