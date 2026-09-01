import type { TransactionPort } from "@core/ports/services/transaction.port";
import type { CreatePostInput } from "./create-post-usecase.input";
import type { CachePort } from "@core/ports/services/cache.port";
import { Post } from "@core/domain/entities/post.entity";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { NotifyNewPostUseCase } from "@core/use-cases/notification/notify-new-post";
import type { NotifyQuotedAuthorUseCase } from "@core/use-cases/notification/notify-quoted-author";
import type { LanguageDetectionPort } from "@core/ports/services/language-detection.port";
import { MediaChannel, MediaOwnerKind, PostType } from "@core/domain/enums";
import type { IMediaAssetRepository } from "@core/ports/repositories/media-asset.repository";
import { resolveAttachableMedia } from "@core/use-cases/shared/media/resolve-attachable-media";
import { ForbiddenError } from "@core/errors/common/forbidden.error";
import { NotFoundError } from "@core/errors/common/not-found.error";
import { BadRequestError } from "@core/errors/common/bad-request.error";
import { MediaNotOwnedError } from "@core/errors";

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
     * @param languageDetectionService - Service that labels the content with the language it was written in
     * @param mediaAssetRepository - Repository the submitted media keys are checked against
     * @param r2PublicUrl - CDN origin media URLs are served from, used to
     * recover the storage key behind a submitted URL
     * @param logger - Service for logging operations
     */
    constructor(
        private readonly transactionService: TransactionPort,
        private readonly cacheService: CachePort,
        private readonly userRepository: IUserRepository,
        private readonly notifyNewPostUseCase: NotifyNewPostUseCase,
        private readonly notifyQuotedAuthorUseCase: NotifyQuotedAuthorUseCase,
        private readonly languageDetectionService: LanguageDetectionPort,
        private readonly mediaAssetRepository: IMediaAssetRepository,
        private readonly r2PublicUrl: string,
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
     * @throws MediaNotOwnedError - When a submitted media URL is not one this
     * author uploaded, or was rejected by moderation
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
     * The language is detected before the transaction opens, from the content
     * alone: the detector is in-process and pure, so there is nothing to gain
     * from holding the write open across it, and a post whose language cannot
     * be told is stored with a null rather than a guess.
     *
     * Media is resolved before the transaction as well, and this is the check
     * that makes moderation mean anything at all. Scanning at upload time only
     * governs what the upload endpoint writes to storage; nothing stops a
     * client from skipping that endpoint and putting its own URLs straight in
     * this body. Requiring every URL to resolve to an asset this author
     * uploaded, through the media channel, and that moderation did not reject,
     * closes that path. The assets are then bound to the post inside the
     * transaction, so a rolled-back write leaves no asset claiming a post that
     * does not exist.
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

        const lang = await this.languageDetectionService.detect(input.content);

        const media = await resolveAttachableMedia({
            mediaUrls: input.mediaUrls || [],
            uploaderId: input.authorId,
            channel: MediaChannel.POST_MEDIA,
            cdnBaseUrl: this.r2PublicUrl,
            mediaAssetRepository: this.mediaAssetRepository,
        });

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
                    lang,
                    media.isSensitive,
                    media.mediaStatus,
                );

                const created = await ctx.postRepository.create(post);

                if (media.storageKeys.length > 0) {
                    // The attach is the atomic claim, not the check above it:
                    // two requests carrying the same key both pass that check,
                    // and only one can come back with every row written.
                    const attached =
                        await ctx.mediaAssetRepository.attachToOwner(
                            media.storageKeys,
                            MediaOwnerKind.POST,
                            created.id,
                        );

                    if (attached !== media.storageKeys.length) {
                        throw new MediaNotOwnedError();
                    }
                }

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
