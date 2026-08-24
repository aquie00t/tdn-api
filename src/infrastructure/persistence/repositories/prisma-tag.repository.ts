import type {
    ITagRepository,
    TagSearchItem,
    TrendItem,
    TrendingParams,
} from "@core/ports/repositories/tag.repository";
import type { PrismaTransactionalClient } from "@infrastructure/persistence/database/prisma-client.type";

/**
 * Prisma implementation of the Tag repository.
 *
 * Provides database operations for Tag entities using Prisma ORM.
 * Implements the ITagRepository interface to ensure consistent
 * data access patterns across different persistence implementations.
 */
export class PrismaTagRepository implements ITagRepository {
    /**
     * Initializes the PrismaTagRepository.
     *
     * @param prisma - The Prisma transactional client instance used for database operations.
     */
    constructor(private readonly prisma: PrismaTransactionalClient) {}

    /**
     * Retrieves the most frequently used tags (trending) within a specified time window.
     * Uses a "Twitter-style" trend algorithm where the tag itself represents the category.
     *
     * @param params - The parameters containing the limit of tags to retrieve and the time window in days.
     * @returns A promise that resolves to an array of trending tags (TrendItem).
     */
    async findTrending(params: TrendingParams): Promise<TrendItem[]> {
        const { limit, windowDays } = params;

        const windowStart = new Date(
            Date.now() - windowDays * 24 * 60 * 60 * 1000,
        );

        const rawTags = await this.prisma.tag.findMany({
            where: {
                posts: {
                    some: { createdAt: { gte: windowStart } },
                },
            },
            include: {
                posts: {
                    where: { createdAt: { gte: windowStart } },
                    select: { id: true },
                },
            },
        });

        return rawTags
            .map((tag): TrendItem => ({
                tag: tag.name,
                postCount: tag.posts.length,
                category: null,
            }))
            .sort((a, b) => b.postCount - a.postCount)
            .slice(0, limit);
    }

    /**
     * Searches for tags by name using a case-insensitive substring match.
     * Results are ordered by the total number of posts associated with the tag, descending.
     *
     * @param query - The search string to match against tag names.
     * @param limit - The maximum number of results to return (defaults to 10).
     * @returns A promise that resolves to an array of matching tags (TagSearchItem).
     */
    async search(query: string, limit = 10): Promise<TagSearchItem[]> {
        const rawTags = await this.prisma.tag.findMany({
            where: {
                name: { contains: query, mode: "insensitive" },
            },
            include: {
                _count: { select: { posts: true } },
            },
            orderBy: {
                posts: { _count: "desc" },
            },
            take: limit,
        });

        return rawTags.map((tag): TagSearchItem => ({
            name: tag.name,
            postCount: tag._count.posts,
            category: null,
        }));
    }
}
