import type { IArticleLikeRepository } from "@core/ports/repositories/article-like.repository";
import type { PrismaTransactionalClient } from "@infrastructure/persistence/database/prisma-client.type";

/**
 * Prisma implementation of the article like repository.
 */
export class PrismaArticleLikeRepository implements IArticleLikeRepository {
    /**
     * @param prisma - Prisma client, possibly scoped to a transaction
     */
    constructor(private readonly prisma: PrismaTransactionalClient) {}

    /**
     * Creates a like relationship between a user and an article
     * @param articleId - The article being liked
     * @param userId - The user liking it
     */
    async like(articleId: string, userId: string): Promise<void> {
        await this.prisma.articleLike.create({ data: { articleId, userId } });
    }

    /**
     * Checks whether a user has already liked an article
     * @param articleId - The article to check
     * @param userId - The user to check for
     * @returns True when a like row exists
     */
    async isLiked(articleId: string, userId: string): Promise<boolean> {
        const existing = await this.prisma.articleLike.findUnique({
            where: { articleId_userId: { articleId, userId } },
            select: { id: true },
        });

        return existing !== null;
    }

    /**
     * Removes a like relationship between a user and an article
     * @param articleId - The article being unliked
     * @param userId - The user removing their like
     */
    async unlike(articleId: string, userId: string): Promise<void> {
        await this.prisma.articleLike.delete({
            where: { articleId_userId: { articleId, userId } },
        });
    }

    /**
     * Increments the cached like count of an article
     * @param articleId - The article to update
     */
    async incrementLikeCount(articleId: string): Promise<void> {
        await this.prisma.article.update({
            where: { id: articleId },
            data: { likeCount: { increment: 1 } },
        });
    }

    /**
     * Decrements the cached like count of an article
     * @param articleId - The article to update
     */
    async decrementLikeCount(articleId: string): Promise<void> {
        await this.prisma.article.update({
            where: { id: articleId },
            data: { likeCount: { decrement: 1 } },
        });
    }
}
