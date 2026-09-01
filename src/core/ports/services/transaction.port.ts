import type { IRefreshTokenRepository } from "@core/ports/repositories/refresh-token.repository";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { ICommentRepository } from "@core/ports/repositories/comment.repository";
import type { IPostLikeRepository } from "@core/ports/repositories/post-like.repository";
import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import type { IBookmarkRepository } from "../repositories/bookmark.repository";
import type { IVerificationTokenRepository } from "@core/ports/repositories/verification-token.repository";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { IArticleLikeRepository } from "@core/ports/repositories/article-like.repository";
import type { IMediaAssetRepository } from "@core/ports/repositories/media-asset.repository";

/**
 * Provides transactional access to repositories within a single atomic operation.
 */
export interface TransactionContext {
    /** Repository for user-related data operations within the transaction. */
    readonly userRepository: IUserRepository;

    /** Repository for refresh token-related data operations within the transaction. */
    readonly refreshTokenRepository: IRefreshTokenRepository;

    /** Repository for comment-related data operations within the transaction. */
    readonly commentRepository: ICommentRepository;

    /** Repository for post-related data operations within the transaction. */
    readonly postRepository: IPostRepository;

    /** Repository for post like-related data operations within the transaction. */
    readonly postLikeRepository: IPostLikeRepository;

    /** Repository for notification-related data operations within the transaction. */
    readonly notificationRepository: INotificationRepository;
    /** */
    readonly bookmarkRepository: IBookmarkRepository;
    /** Repository for verification token operations within the transaction. */
    readonly verificationTokenRepository: IVerificationTokenRepository;

    /** Repository for article-related data operations within the transaction. */
    readonly articleRepository: IArticleRepository;

    /** Repository for article like operations within the transaction. */
    readonly articleLikeRepository: IArticleLikeRepository;

    /**
     * Repository for media assets within the transaction.
     *
     * Media is bound to its content inside the same transaction that creates
     * the content: a rollback that left assets pointing at a post which was
     * never written would make an abandoned upload look claimed, and the purge
     * job would then leave it in storage forever.
     */
    readonly mediaAssetRepository: IMediaAssetRepository;
}

/**
 * Port interface for executing operations within a database transaction.
 */
export interface TransactionPort {
    /**
     * Executes a unit of work within a single atomic transaction.
     * If the work throws, the transaction is rolled back.
     *
     * @param work - A callback receiving the transactional context with scoped repositories.
     * @returns A promise that resolves to the return value of the work callback.
     */
    runInTransaction<T>(
        work: (ctx: TransactionContext) => Promise<T>,
    ): Promise<T>;
}
