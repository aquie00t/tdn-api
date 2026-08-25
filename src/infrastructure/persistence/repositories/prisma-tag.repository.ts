import type {
    ITagRepository,
    TagSearchItem,
    TrendItem,
    TrendingParams,
} from "@core/ports/repositories/tag.repository";
import { ArticleStatus } from "@core/domain/enums";
import type { PrismaTransactionalClient } from "@infrastructure/persistence/database/prisma-client.type";

/**
 * Prisma implementation of the Tag repository.
 *
 * Tags are shared between posts and articles: one vocabulary, one autocomplete,
 * one trend list. Both counts are computed by the database rather than by
 * loading the related rows.
 */
export class PrismaTagRepository implements ITagRepository {
    /**
     * Initializes the PrismaTagRepository.
     *
     * @param prisma - The Prisma transactional client instance used for database operations.
     */
    constructor(private readonly prisma: PrismaTransactionalClient) {}

    /**
     * Retrieves the most frequently used tags within a time window.
     *
     * Only published articles are counted. A draft contributing to a public
     * trend list would leak its existence, and it would also let anyone push a
     * tag into the trends by writing an article they never publish.
     *
     * The counts are computed by the database. Ordering happens in memory
     * because no single orderBy can express "posts plus articles"; what is
     * fetched is two integers and a name per tag, and the candidate set is
     * bounded by the window, so this is a different order of magnitude from
     * the previous version which loaded every matching post row.
     *
     * @param params - The limit of tags to retrieve and the time window in days.
     * @returns A promise that resolves to an array of trending tags.
     */
    async findTrending(params: TrendingParams): Promise<TrendItem[]> {
        const { limit, windowDays } = params;

        const windowStart = new Date(
            Date.now() - windowDays * 24 * 60 * 60 * 1000,
        );

        const postWindow = { createdAt: { gte: windowStart } };
        const articleWindow = {
            status: ArticleStatus.PUBLISHED,
            publishedAt: { gte: windowStart },
        };

        const rawTags = await this.prisma.tag.findMany({
            where: {
                OR: [
                    { posts: { some: postWindow } },
                    { articles: { some: articleWindow } },
                ],
            },
            select: {
                name: true,
                _count: {
                    select: {
                        posts: { where: postWindow },
                        articles: { where: articleWindow },
                    },
                },
            },
        });

        return rawTags
            .map((tag): TrendItem => ({
                tag: tag.name,
                postCount: tag._count.posts,
                articleCount: tag._count.articles,
                category: null,
            }))
            .sort(
                (a, b) =>
                    b.postCount +
                    b.articleCount -
                    (a.postCount + a.articleCount),
            )
            .slice(0, limit);
    }

    /**
     * Searches for tags by name using a case-insensitive substring match.
     *
     * Results are ordered by posts and published articles combined, which no
     * single Prisma orderBy can express, so the ranking is applied to the
     * matching set. That set is bounded by the search term.
     *
     * @param query - The search string to match against tag names.
     * @param limit - The maximum number of results to return (defaults to 10).
     * @returns A promise that resolves to an array of matching tags.
     */
    async search(query: string, limit = 10): Promise<TagSearchItem[]> {
        const rawTags = await this.prisma.tag.findMany({
            where: {
                name: { contains: query, mode: "insensitive" },
            },
            select: {
                name: true,
                _count: {
                    select: {
                        posts: true,
                        articles: {
                            where: { status: ArticleStatus.PUBLISHED },
                        },
                    },
                },
            },
        });

        return rawTags
            .map((tag): TagSearchItem => ({
                name: tag.name,
                postCount: tag._count.posts,
                articleCount: tag._count.articles,
                category: null,
            }))
            .sort(
                (a, b) =>
                    b.postCount +
                    b.articleCount -
                    (a.postCount + a.articleCount),
            )
            .slice(0, limit);
    }
}
