import type { IArticleBookmarkRepository } from "@core/ports/repositories/article-bookmark.repository";
import type { PrismaTransactionalClient } from "@infrastructure/persistence/database/prisma-client.type";

/**
 * Prisma implementation of the article bookmark repository.
 */
export class PrismaArticleBookmarkRepository implements IArticleBookmarkRepository {
    /**
     * @param prisma - Prisma client, possibly scoped to a transaction
     */
    constructor(private readonly prisma: PrismaTransactionalClient) {}

    /**
     * Saves a bookmark for an article
     * @param articleId - The article being bookmarked
     * @param userId - The user creating the bookmark
     */
    async save(articleId: string, userId: string): Promise<void> {
        await this.prisma.articleBookmark.create({
            data: { articleId, userId },
        });
    }

    /**
     * Removes a bookmark for an article
     * @param articleId - The article being unbookmarked
     * @param userId - The user removing the bookmark
     */
    async remove(articleId: string, userId: string): Promise<void> {
        await this.prisma.articleBookmark.delete({
            where: { articleId_userId: { articleId, userId } },
        });
    }

    /**
     * Checks whether an article is bookmarked by a user
     * @param articleId - The article to check
     * @param userId - The user to check for
     * @returns True when a bookmark row exists
     */
    async isBookmarked(articleId: string, userId: string): Promise<boolean> {
        const existing = await this.prisma.articleBookmark.findUnique({
            where: { articleId_userId: { articleId, userId } },
            select: { id: true },
        });

        return existing !== null;
    }
}
