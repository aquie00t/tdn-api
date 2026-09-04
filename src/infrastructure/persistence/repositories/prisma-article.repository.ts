import type { Article } from "@core/domain/entities/article.entity";
import { ArticleStatus } from "@core/domain/enums";
import type {
    IArticleRepository,
    GetArticlesParams,
    GetAuthorArticlesParams,
} from "@core/ports/repositories/article.repository";
import {
    ArticlePrismaMapper,
    type ArticleWithRelations,
} from "@infrastructure/persistence/mappers/article-prisma.mapper";
import type { PrismaTransactionalClient } from "@infrastructure/persistence/database/prisma-client.type";
import { MENTIONED_USERS_SELECT } from "./mention-select";
import type { Prisma } from "@generated/prisma/client";

/**
 * The relation include shared by every read in this repository.
 *
 * Declared with literal types rather than the broad `Prisma.ArticleInclude`, so
 * Prisma still infers the exact payload shape that `ArticleWithRelations`
 * describes. Widening it here would make Prisma return a full `User` and an
 * unrequested `_count`, and the mapper cast would stop type-checking.
 */
type ArticleRelationInclude = {
    author: {
        select: {
            id: true;
            username: true;
            profile: { select: { avatarUrl: true; fullName: true } };
        };
    };
    tags: true;
    mentionedUsers: { select: { id: true; username: true } };
    likes: { where: { userId: string } } | false;
    bookmarks: { where: { userId: string } } | false;
    _count: { select: { comments: true } };
};

/**
 * Prisma implementation of the Article repository.
 *
 * Every method that returns a *list* pins `status` to PUBLISHED. The single
 * exception is `findByAuthorId`, whose author identifier is always the
 * authenticated principal — that separation is the first of the two layers
 * keeping drafts from leaking, the second being the visibility check in the
 * read use-cases.
 */
export class PrismaArticleRepository implements IArticleRepository {
    /**
     * @param prisma - Prisma client, possibly scoped to a transaction
     */
    constructor(private readonly prisma: PrismaTransactionalClient) {}

    /**
     * Builds the relation include, scoping like and bookmark rows to one viewer.
     *
     * Guests get `false`, so the relation is absent and both flags resolve to
     * false rather than leaking other users' interactions.
     *
     * @param currentUserId - The viewer, when authenticated
     * @returns A Prisma include object
     */
    private buildInclude(currentUserId?: string): ArticleRelationInclude {
        return {
            author: {
                select: {
                    id: true,
                    username: true,
                    profile: { select: { avatarUrl: true, fullName: true } },
                },
            },
            tags: true,
            mentionedUsers: MENTIONED_USERS_SELECT,
            likes: currentUserId
                ? ({ where: { userId: currentUserId } } as const)
                : (false as const),
            bookmarks: currentUserId
                ? ({ where: { userId: currentUserId } } as const)
                : (false as const),
            _count: { select: { comments: true } } as const,
        };
    }

    /**
     * Builds the connectOrCreate payload for an article's tags.
     *
     * Tag names arrive already normalized from the use-case; unlike posts, they
     * are never regex-extracted from the body.
     *
     * @param tags - Normalized tag names
     * @returns A Prisma tag relation payload
     */
    private buildTagConnect(
        tags: string[],
    ): Prisma.TagCreateOrConnectWithoutArticlesInput[] {
        const unique = [...new Set(tags)];
        return unique.map((name) => ({
            where: { name },
            create: { name },
        }));
    }

    /**
     * Persists a new article together with its tags.
     *
     * @param article - The Article entity to store
     * @returns The stored article with relations loaded
     */
    async create(article: Article): Promise<Article> {
        const data = ArticlePrismaMapper.toPrismaArticle(article);

        const created = await this.prisma.article.create({
            data: {
                ...data,
                tags: { connectOrCreate: this.buildTagConnect(article.tags) },
                mentionedUsers: {
                    connect: article.mentions.map((mention) => ({
                        id: mention.id,
                    })),
                },
            },
            include: this.buildInclude(),
        });

        return ArticlePrismaMapper.toDomainArticle(
            created as ArticleWithRelations,
        );
    }

    /**
     * Persists an edit, replacing the tag set with the entity's current tags.
     *
     * @param article - The Article entity carrying the updated state
     * @returns The stored article with relations loaded
     */
    async update(article: Article): Promise<Article> {
        const data = ArticlePrismaMapper.toPrismaArticle(article);

        const updated = await this.prisma.article.update({
            where: { id: article.id },
            data: {
                ...data,
                tags: {
                    set: [],
                    connectOrCreate: this.buildTagConnect(article.tags),
                },
                // Replaced wholesale like the tags: the body is the only
                // source, so a handle deleted from it has to lose its row.
                mentionedUsers: {
                    set: [],
                    connect: article.mentions.map((mention) => ({
                        id: mention.id,
                    })),
                },
            },
            include: this.buildInclude(article.author.id),
        });

        return ArticlePrismaMapper.toDomainArticle(
            updated as ArticleWithRelations,
        );
    }

    /**
     * Retrieves a page of published articles, newest publication first.
     *
     * @param params - Pagination and filtering parameters
     * @returns The matching articles and the total row count
     */
    async findAll(
        params: GetArticlesParams,
    ): Promise<{ articles: Article[]; total: number }> {
        const {
            page,
            limit,
            tag,
            authorId,
            categories,
            followingIds,
            savedByUserId,
            currentUserId,
        } = params;

        const where: Prisma.ArticleWhereInput = {
            status: ArticleStatus.PUBLISHED,
        };

        if (tag) where.tags = { some: { name: tag } };
        if (authorId) where.authorId = authorId;
        if (categories && categories.length > 0) {
            where.category = { hasSome: categories };
        }
        if (followingIds) where.authorId = { in: followingIds };
        if (savedByUserId) {
            where.bookmarks = { some: { userId: savedByUserId } };
        }

        const [rows, total] = await Promise.all([
            this.prisma.article.findMany({
                where,
                include: this.buildInclude(currentUserId),
                orderBy: { publishedAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.article.count({ where }),
        ]);

        return {
            articles: rows.map((row) =>
                ArticlePrismaMapper.toDomainArticle(
                    row as ArticleWithRelations,
                ),
            ),
            total,
        };
    }

    /**
     * Retrieves one author's articles, drafts and archives included.
     *
     * Ordered by last update rather than publication date, because a draft has
     * no publication date to sort on.
     *
     * @param params - The author, pagination and an optional status filter
     * @returns The matching articles and the total row count
     */
    async findByAuthorId(
        params: GetAuthorArticlesParams,
    ): Promise<{ articles: Article[]; total: number }> {
        const { authorId, page, limit, status } = params;

        const where: Prisma.ArticleWhereInput = { authorId };
        if (status) where.status = status;

        const [rows, total] = await Promise.all([
            this.prisma.article.findMany({
                where,
                include: this.buildInclude(authorId),
                orderBy: { updatedAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.article.count({ where }),
        ]);

        return {
            articles: rows.map((row) =>
                ArticlePrismaMapper.toDomainArticle(
                    row as ArticleWithRelations,
                ),
            ),
            total,
        };
    }

    /**
     * Retrieves an article by slug, regardless of status.
     *
     * @param slug - The article slug
     * @param currentUserId - Viewer used to resolve like and bookmark flags
     * @returns The article, or null when no row matches
     */
    async findBySlug(
        slug: string,
        currentUserId?: string,
    ): Promise<Article | null> {
        const row = await this.prisma.article.findUnique({
            where: { slug },
            include: this.buildInclude(currentUserId),
        });

        return row
            ? ArticlePrismaMapper.toDomainArticle(row as ArticleWithRelations)
            : null;
    }

    /**
     * Retrieves an article by identifier, regardless of status.
     *
     * @param id - The article identifier
     * @param currentUserId - Viewer used to resolve like and bookmark flags
     * @returns The article, or null when no row matches
     */
    async findById(
        id: string,
        currentUserId?: string,
    ): Promise<Article | null> {
        const row = await this.prisma.article.findUnique({
            where: { id },
            include: this.buildInclude(currentUserId),
        });

        return row
            ? ArticlePrismaMapper.toDomainArticle(row as ArticleWithRelations)
            : null;
    }

    /**
     * Counts the published articles written by one author.
     *
     * A single count query rather than a list read: the composite index on
     * (author_id, status) covers it exactly.
     *
     * @param authorId - The author whose articles are counted
     * @returns The number of published articles
     */
    async countPublishedByAuthorId(authorId: string): Promise<number> {
        return await this.prisma.article.count({
            where: { authorId, status: ArticleStatus.PUBLISHED },
        });
    }

    /**
     * Deletes an article. Likes, bookmarks and tag links cascade in the schema.
     *
     * @param id - The identifier of the article to delete
     */
    async delete(id: string): Promise<void> {
        await this.prisma.article.delete({ where: { id } });
    }
}
