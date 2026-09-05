import type { PrismaClient } from "@generated/prisma/client";
import type {
    TransactionPort,
    TransactionContext,
} from "@core/ports/services/transaction.port";
import { PrismaUserRepository } from "../repositories/prisma-user.repository";
import { PrismaRefreshTokenRepository } from "../repositories/prisma-refresh-token.repository";
import type { FastifyInstance } from "fastify";
import { PrismaCommentRepository } from "../repositories/prisma-comment.repository";
import { PrismaPostRepository } from "../repositories/prisma-post.repository";
import { PrismaNotificationRepository } from "../repositories/prisma-notification.repository";
import { PrismaLikeRepository } from "../repositories/prisma-like.repository";
import { PrismaBookmarkRepository } from "../repositories/prisma-bookmark.repository";
import { PrismaVerificationTokenRepository } from "../repositories/prisma-verification-token.repository";
import { PrismaArticleRepository } from "../repositories/prisma-article.repository";
import { PrismaArticleLikeRepository } from "../repositories/prisma-article-like.repository";
import { PrismaMediaAssetRepository } from "../repositories/prisma-media-asset.repository";
import { PrismaConversationRepository } from "../repositories/prisma-conversation.repository";
import { PrismaMessageRepository } from "../repositories/prisma-message.repository";
import { PrismaBlockRepository } from "../repositories/prisma-block.repository";
import { PrismaFollowUserRepository } from "../repositories/prisma-follow.repository";

/**
 * Transaction service implementation for managing database transactions
 * Provides atomic operations across multiple repositories within a single transaction
 */
export class TransactionService implements TransactionPort {
    /**
     * Creates a new TransactionService instance
     * @param prisma - The Prisma client instance
     * @param config - Fastify configuration containing grace period settings
     */
    constructor(
        private readonly prisma: PrismaClient,
        private readonly config: FastifyInstance["config"],
    ) {}

    /**
     * Executes a unit of work within a single atomic transaction
     * If the work throws, the transaction is rolled back
     * @param work - A callback receiving the transactional context with scoped repositories
     * @returns A promise that resolves to the return value of the work callback
     */
    async runInTransaction<T>(
        work: (ctx: TransactionContext) => Promise<T>,
    ): Promise<T> {
        return await this.prisma.$transaction(async (tx) => {
            const context: TransactionContext = {
                userRepository: new PrismaUserRepository(tx, {
                    gracePeriodDays: this.config.USER_PURGE_GRACE_PERIOD_DAYS,
                }),
                refreshTokenRepository: new PrismaRefreshTokenRepository(tx, {
                    gracePeriodDays:
                        this.config.REFRESH_TOKEN_PURGE_GRACE_PERIOD_DAYS,
                }),
                commentRepository: new PrismaCommentRepository(tx),
                postRepository: new PrismaPostRepository(tx),
                postLikeRepository: new PrismaLikeRepository(tx),
                notificationRepository: new PrismaNotificationRepository(tx),
                bookmarkRepository: new PrismaBookmarkRepository(tx),
                verificationTokenRepository:
                    new PrismaVerificationTokenRepository(tx),
                articleRepository: new PrismaArticleRepository(tx),
                articleLikeRepository: new PrismaArticleLikeRepository(tx),
                mediaAssetRepository: new PrismaMediaAssetRepository(tx),
                conversationRepository: new PrismaConversationRepository(tx),
                messageRepository: new PrismaMessageRepository(tx),
                blockRepository: new PrismaBlockRepository(tx),
                followUserRepository: new PrismaFollowUserRepository(tx),
            };

            return await work(context);
        });
    }
}
