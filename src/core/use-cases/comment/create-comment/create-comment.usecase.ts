/**
 * Use case for creating comments on posts and articles
 * Handles comment creation, notification generation, and post comment count updates
 */
import type { TransactionPort } from "@core/ports/services/transaction.port";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import type { TransactionContext } from "@core/ports/services/transaction.port";
import type { CommentTarget } from "@core/ports/repositories/comment.repository";
import { Comment } from "@core/domain/entities/comment.entity";
import { Notification } from "@core/domain/entities/notification.entity";
import { NotificationType } from "@core/domain/enums/notification-type.enum";
import { MediaChannel, MediaOwnerKind } from "@core/domain/enums";
import type { IMediaAssetRepository } from "@core/ports/repositories/media-asset.repository";
import { resolveAttachableMedia } from "@core/use-cases/shared/media/resolve-attachable-media";
import { resolveMentions } from "@core/use-cases/shared/mentions/resolve-mentions";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { NotifyMentionedUsersUseCase } from "@core/use-cases/notification/notify-mentioned-users";
import {
    ArticleNotPublishedError,
    BadRequestError,
    MediaNotOwnedError,
    NotFoundError,
} from "@core/errors";
import type { CreateCommentUseCaseInput } from "./create-comment-usecase.input";

export class CreateCommentUseCase {
    /**
     * Creates a new CreateCommentUseCase instance
     * @param transactionService - Service for handling database transactions
     * @param realtimeService - Service for sending real-time notifications
     * @param mediaAssetRepository - Repository the submitted media keys are checked against
     * @param r2PublicUrl - CDN origin media URLs are served from, used to
     * recover the storage key behind a submitted URL
     * @param userRepository - Repository the @handles in the content are resolved against
     * @param notifyMentionedUsersUseCase - Use case that tells the users named in the content
     * @param logger - Service for logging operations
     */
    constructor(
        private readonly transactionService: TransactionPort,
        private readonly realtimeService: RealtimePort,
        private readonly mediaAssetRepository: IMediaAssetRepository,
        private readonly r2PublicUrl: string,
        private readonly userRepository: IUserRepository,
        private readonly notifyMentionedUsersUseCase: NotifyMentionedUsersUseCase,
        private readonly logger: LoggerPort,
    ) {}

    /**
     * Loads the post or article being commented on and returns its author.
     *
     * The two article failures are deliberately different. An unpublished
     * article the commenter cannot see is a 404, identical to one that does
     * not exist - answering 409 there would confirm that a draft slug is real,
     * which is the leak drafts must not have. Only the author, who can already
     * see their own draft, is told that the article is simply not published
     * yet.
     *
     * A blocked author\'s content answers 404 too, for the same reason it does
     * on the detail endpoint: an error that named the block would let anyone
     * test for one by replying to a link.
     *
     * @param ctx - The transactional repositories
     * @param target - What is being commented on
     * @param commenterId - The user attempting to comment
     * @returns The owner of the target, plus its slug when it is an article
     * @throws NotFoundError - When the target does not exist or is not visible
     * @throws ArticleNotPublishedError - When the author's own article is not published
     */
    private async resolveTarget(
        ctx: TransactionContext,
        target: CommentTarget,
        commenterId: string,
    ): Promise<{ authorId: string; slug?: string }> {
        if (target.type === "POST") {
            const post = await ctx.postRepository.findById(target.id);
            if (!post) throw new NotFoundError("Post not found.");

            await this.assertAuthorVisible(
                ctx,
                post.author.id,
                commenterId,
                "Post not found.",
            );

            return { authorId: post.author.id };
        }

        const article = await ctx.articleRepository.findById(target.id);

        if (!article || !article.isVisibleTo(commenterId)) {
            throw new NotFoundError("Article not found.");
        }

        await this.assertAuthorVisible(
            ctx,
            article.author.id,
            commenterId,
            "Article not found.",
        );

        if (!article.isPublished()) {
            throw new ArticleNotPublishedError(
                "You cannot comment on an article that is not published.",
            );
        }

        return { authorId: article.author.id, slug: article.slug };
    }

    /**
     * Hides content whose author is blocked, in either direction.
     *
     * @param ctx - The transactional repositories
     * @param authorId - Who wrote the thing being commented on
     * @param commenterId - The user attempting to comment
     * @param message - The not-found message for this kind of target
     * @throws NotFoundError - When a block stands between the two
     */
    private async assertAuthorVisible(
        ctx: TransactionContext,
        authorId: string,
        commenterId: string,
        message: string,
    ): Promise<void> {
        if (authorId === commenterId) return;

        const blocked = await ctx.blockRepository.existsBetween(
            commenterId,
            authorId,
        );

        if (blocked) throw new NotFoundError(message);
    }

    /**
     * Executes the comment creation use case
     * @param input - Comment content, its target, author and optional parent
     * @returns Promise that resolves with the created Comment entity
     * @throws NotFoundError if the target or the parent comment is not found
     * @throws BadRequestError if the parent comment belongs to something else
     * @throws ArticleNotPublishedError if the article is still a draft
     * @throws MediaNotOwnedError if a submitted media URL is not one this
     * author uploaded, or was rejected by moderation
     *
     * @remarks
     * Comment media comes off the same upload endpoint as post media, so it
     * gets the same ownership check. Without it a comment would be an open
     * side door into publishing any URL the client likes, which is the one
     * thing the moderation pipeline has to prevent.
     */
    async execute(input: CreateCommentUseCaseInput): Promise<Comment> {
        const media = await resolveAttachableMedia({
            mediaUrls: input.mediaUrls || [],
            uploaderId: input.authorId,
            channel: MediaChannel.POST_MEDIA,
            cdnBaseUrl: this.r2PublicUrl,
            mediaAssetRepository: this.mediaAssetRepository,
        });

        const mentions = await resolveMentions({
            content: input.content,
            userRepository: this.userRepository,
        });

        // Both are decided inside the transaction and read again after it, so
        // the mention fan-out can skip whoever the comment itself already
        // notified and can deep-link an article by slug.
        let notifyUserId: string | null = null;
        let articleSlug: string | undefined;

        const savedComment = await this.transactionService.runInTransaction(
            async (ctx) => {
                const { target } = input;
                const { authorId: targetAuthorId, slug: targetSlug } =
                    await this.resolveTarget(ctx, target, input.authorId);

                articleSlug = targetSlug;
                let notificationType = NotificationType.COMMENT;

                if (input.parentId) {
                    const parentComment = await ctx.commentRepository.findById(
                        input.parentId,
                    );
                    if (!parentComment) {
                        throw new NotFoundError("Parent comment not found.");
                    }

                    const parentTarget = parentComment.target;
                    if (
                        parentTarget.type !== target.type ||
                        parentTarget.id !== target.id
                    ) {
                        throw new BadRequestError(
                            "Parent comment belongs to a different post.",
                        );
                    }

                    if (parentComment.authorId !== input.authorId) {
                        notifyUserId = parentComment.authorId;
                        // Post replies keep using COMMENT so their existing
                        // notification behaviour is unchanged.
                        if (target.type === "ARTICLE") {
                            notificationType = NotificationType.COMMENT_REPLY;
                        }
                    }
                } else if (targetAuthorId !== input.authorId) {
                    notifyUserId = targetAuthorId;
                }

                const tempComment =
                    target.type === "POST"
                        ? Comment.createForPost(
                              input.content,
                              target.id,
                              input.authorId,
                              input.parentId,
                              input.mediaUrls || [],
                              media.isSensitive,
                              media.mediaStatus,
                              mentions,
                          )
                        : Comment.createForArticle(
                              input.content,
                              target.id,
                              input.authorId,
                              input.parentId,
                              input.mediaUrls || [],
                              media.isSensitive,
                              media.mediaStatus,
                              mentions,
                          );

                const savedComment =
                    await ctx.commentRepository.create(tempComment);

                if (media.storageKeys.length > 0) {
                    // The attach is the atomic claim, not the check above it: two
                    // requests carrying the same key both pass that check, and only
                    // one can come back with every row written.
                    const attached =
                        await ctx.mediaAssetRepository.attachToOwner(
                            media.storageKeys,
                            MediaOwnerKind.COMMENT,
                            savedComment.id,
                        );

                    if (attached !== media.storageKeys.length) {
                        throw new MediaNotOwnedError();
                    }
                }

                // Articles derive their comment count from a relation count, so
                // only posts carry a counter to maintain.
                if (target.type === "POST") {
                    await ctx.postRepository.incrementCommentsCount(target.id);
                }

                if (input.parentId) {
                    await ctx.commentRepository.incrementRepliesCount(
                        input.parentId,
                    );
                }

                if (notifyUserId) {
                    const notification = Notification.create(
                        notifyUserId,
                        input.authorId,
                        notificationType,
                        {
                            commentId: savedComment.id,
                            postId:
                                target.type === "POST" ? target.id : undefined,
                            articleId:
                                target.type === "ARTICLE"
                                    ? target.id
                                    : undefined,
                        },
                    );

                    await ctx.notificationRepository.create(notification);

                    this.realtimeService.emitToUser(
                        notifyUserId,
                        "new-notification",
                        {
                            type: notificationType,
                            issuerId: input.authorId,
                            postId:
                                target.type === "POST" ? target.id : undefined,
                            articleId:
                                target.type === "ARTICLE"
                                    ? target.id
                                    : undefined,
                            articleSlug: targetSlug,
                            commentId: savedComment.id,
                            referenceId: savedComment.id,
                        },
                    );
                }

                return savedComment;
            },
        );

        if (mentions.length > 0) {
            void this.notifyMentionedUsersUseCase
                .execute({
                    issuerId: input.authorId,
                    mentionedUserIds: mentions.map((mention) => mention.id),
                    target: {
                        commentId: savedComment.id,
                        postId:
                            input.target.type === "POST"
                                ? input.target.id
                                : undefined,
                        articleId:
                            input.target.type === "ARTICLE"
                                ? input.target.id
                                : undefined,
                    },
                    articleSlug,
                    // Whoever this comment already notified - the author being
                    // answered, or the comment being replied to - must not get
                    // a second row just for being named in the same body.
                    excludeUserIds: notifyUserId ? [notifyUserId] : [],
                })
                .catch((err: unknown) => {
                    this.logger.error(
                        { err, commentId: savedComment.id },
                        "Failed to notify the mentioned users",
                    );
                });
        }

        return savedComment;
    }
}
