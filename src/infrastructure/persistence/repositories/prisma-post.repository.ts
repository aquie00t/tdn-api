import type { MediaState } from "@core/ports/repositories/media-asset.repository";
import type {
    IPostRepository,
    GetPostsParams,
    FeedCandidateParams,
    CountPostsParams,
} from "@core/ports/repositories/post.repository";
import type { FeedCandidate } from "@core/domain/interfaces/feed-candidate.interface";
import type { Post } from "@core/domain/entities/post.entity";
import {
    PostPrismaMapper,
    type PostWithRelations,
} from "@infrastructure/persistence/mappers/post-prisma.mapper";
import type { PostType } from "@core/domain/enums/post-type.enum";
import type { PrismaTransactionalClient } from "@infrastructure/persistence/database/prisma-client.type";
import { MENTIONED_USERS_SELECT } from "./mention-select";
import type { Prisma } from "@generated/prisma/client";

/**
 * The author fields every post read selects.
 *
 * `as const` is load-bearing: the include clauses below are inferred by Prisma
 * at each call site, and a widened `boolean` here would cost that inference.
 */
const POST_AUTHOR_SELECT = {
    select: {
        id: true,
        username: true,
        verifiedUntil: true,
        profile: { select: { avatarUrl: true, fullName: true } },
    },
} as const;

/**
 * The quoted post embedded in a quote post.
 *
 * One level deep and without its own quote: a quote card shows the post being
 * quoted, never the chain behind it. Counters and the viewer's like/bookmark
 * state are left out too, so embedding one costs no extra joins.
 */
const QUOTED_POST_INCLUDE = {
    include: { author: POST_AUTHOR_SELECT },
} as const;

/**
 * Prisma implementation of the Post repository
 *
 * Provides database operations for Post entities using Prisma ORM.
 * Implements the IPostRepository interface to ensure consistent
 * data access patterns across different persistence implementations.
 */
export class PrismaPostRepository implements IPostRepository {
    /**
     * Constructor for PrismaPostRepository
     * @param prisma - An instance of PrismaTransactionalClient for database access
     */
    constructor(private readonly prisma: PrismaTransactionalClient) {}

    /**
     * Creates a new post in the database.
     * Extracts hashtags from the post content and ensures they are stored in the database,
     * associating them with the post. Uses connectOrCreate to avoid duplicate tags.
     * @param post - The Post entity to be created
     * @returns The created Post entity with relations loaded
     */
    async create(post: Post): Promise<Post> {
        const hashtagRegex = /#[\p{L}\p{N}_]+/gu;
        const matches = post.content.match(hashtagRegex) || [];
        const uniqueTags = [
            ...new Set(
                matches.map((tag: string) => tag.slice(1).toLowerCase()),
            ),
        ];

        const prismaData = PostPrismaMapper.toPrismaPost(post);

        const createdRaw = await this.prisma.post.create({
            data: {
                ...prismaData,
                tags: {
                    connectOrCreate: uniqueTags.map((tag: string) => ({
                        where: { name: tag },
                        create: {
                            name: tag,
                        },
                    })),
                },
                // Connect, never connectOrCreate: an unknown tag is worth
                // inventing, an unknown user is not. The use case has already
                // resolved these to accounts that exist.
                mentionedUsers: {
                    connect: post.mentions.map((mention) => ({
                        id: mention.id,
                    })),
                },
            },
            include: {
                author: POST_AUTHOR_SELECT,
                tags: true,
                mentionedUsers: MENTIONED_USERS_SELECT,
                likes: false,
                bookmarks: false,
                quotedPost: QUOTED_POST_INCLUDE,
            },
        });

        return PostPrismaMapper.toDomainPost(createdRaw as PostWithRelations);
    }

    /**
     * Finds posts with pagination and optional filtering by type, author, savedByUserId, tag, followingIds, and categories.
     * Supports sorting by creation date or by like and comment count when filtering by tag.
     * @param params - Parameters for paginated post retrieval with optional filtering.
     * @returns An object containing the array of Post entities and the total count of posts matching the criteria.
     */
    async findAll(
        params: GetPostsParams,
    ): Promise<{ posts: Post[]; total: number }> {
        const { page, limit, currentUserId } = params;
        // The ranked feed supplies its own offset: its chronological tail
        // starts wherever the ranked window ended, which no page number
        // expresses.
        const skip = params.skip ?? (page - 1) * limit;

        const whereCondition = this.buildWhere(params);

        const orderBy = { createdAt: "desc" as const };

        const [total, rawPosts] = await Promise.all([
            this.prisma.post.count({ where: whereCondition }),
            this.prisma.post.findMany({
                where: whereCondition,
                skip,
                take: limit,
                orderBy,
                include: {
                    author: POST_AUTHOR_SELECT,
                    tags: true,
                    mentionedUsers: MENTIONED_USERS_SELECT,
                    likes: currentUserId
                        ? { where: { userId: currentUserId } }
                        : false,
                    bookmarks: currentUserId
                        ? { where: { userId: currentUserId } }
                        : false,
                    quotedPost: QUOTED_POST_INCLUDE,
                },
            }),
        ]);

        const posts = rawPosts.map((post) =>
            PostPrismaMapper.toDomainPost(post as PostWithRelations),
        );

        return { posts, total };
    }

    /**
     * Counts the posts matching a set of feed filters.
     *
     * @param params - The filters, without pagination.
     * @returns The number of matching posts.
     */
    async countAll(params: CountPostsParams): Promise<number> {
        return this.prisma.post.count({ where: this.buildWhere(params) });
    }

    /**
     * Builds the `where` clause shared by the post reads.
     *
     * Shared on purpose: a count that filtered differently from the page it
     * describes would hand the client a page total it can never reach.
     *
     * @param params - The filters to apply.
     * @returns The Prisma where clause.
     */
    private buildWhere(
        params: CountPostsParams & Partial<GetPostsParams>,
    ): Prisma.PostWhereInput {
        const {
            type,
            authorId,
            savedByUserId,
            tag,
            followingIds,
            quotedPostId,
            excludeIds,
            excludeAuthorIds,
            categories,
        } = params;

        return {
            ...(type ? { type } : {}),
            ...this.authorFilter(authorId, followingIds, excludeAuthorIds),
            ...(savedByUserId
                ? { bookmarks: { some: { userId: savedByUserId } } }
                : {}),
            ...(tag ? { tags: { some: { name: tag.toLowerCase() } } } : {}),
            ...(quotedPostId ? { quotedPostId } : {}),
            ...(excludeIds && excludeIds.length > 0
                ? { id: { notIn: excludeIds } }
                : {}),
            ...(categories && categories.length > 0
                ? { category: { hasSome: categories } }
                : {}),
        };
    }

    /**
     * Builds the single `authorId` condition the three author filters share.
     *
     * They cannot be spread side by side: `followingIds`, a lone `authorId`
     * and the blocked-author exclusion all write the same key, and the last
     * one in an object literal silently wins. Blocking is the reason this
     * matters - the exclusion has to survive alongside a `followedOnly` feed,
     * which is exactly the case where the collision would have dropped it.
     *
     * @param authorId - A single author the caller pinned, if any.
     * @param followingIds - The accounts a followed-only feed is scoped to.
     * @param excludeAuthorIds - Authors invisible to the viewer.
     * @returns The `authorId` fragment, or nothing when no filter applies.
     */
    private authorFilter(
        authorId: string | undefined,
        followingIds: string[] | undefined,
        excludeAuthorIds: string[] | undefined,
    ): Prisma.PostWhereInput {
        const notIn =
            excludeAuthorIds && excludeAuthorIds.length > 0
                ? excludeAuthorIds
                : undefined;

        if (followingIds) {
            return {
                authorId: { in: followingIds, ...(notIn ? { notIn } : {}) },
            };
        }

        if (authorId) {
            // A pinned author who is blocked matches nothing, which is the
            // intended answer: the profile they were pinned from is a wall.
            return notIn && notIn.includes(authorId)
                ? { authorId: { in: [] } }
                : { authorId };
        }

        return notIn ? { authorId: { notIn } } : {};
    }

    /**
     * Loads the pool of recent posts the feed ranker scores.
     *
     * Selects the ranking inputs and nothing else - no author, no quote card,
     * no content. The pool is a few hundred rows where the served page is ten,
     * so every column the ranker does not read is paid for a few hundred times
     * over and thrown away. Tags are the exception that has to be paid for:
     * they decide whether a post makes the page at all.
     *
     * @param params - Filters, time window and pool size.
     * @returns The candidates, newest first.
     */
    async findFeedCandidates(
        params: FeedCandidateParams,
    ): Promise<FeedCandidate[]> {
        const { type, tag, categories, followingIds, since, limit } = params;

        const rows = await this.prisma.post.findMany({
            where: {
                createdAt: { gte: since },
                ...(type ? { type } : {}),
                ...this.authorFilter(
                    undefined,
                    followingIds,
                    params.excludeAuthorIds,
                ),
                ...(tag ? { tags: { some: { name: tag.toLowerCase() } } } : {}),
                ...(categories && categories.length > 0
                    ? { category: { hasSome: categories } }
                    : {}),
            },
            // Newest first, so a window that overflows the cap keeps the
            // freshest posts. Ranking then reorders what survives.
            orderBy: { createdAt: "desc" },
            take: limit,
            select: {
                id: true,
                authorId: true,
                lang: true,
                createdAt: true,
                likeCount: true,
                commentCount: true,
                quoteCount: true,
                category: true,
                tags: { select: { name: true } },
            },
        });

        return rows.map((row) => ({
            id: row.id,
            authorId: row.authorId,
            lang: row.lang,
            createdAt: row.createdAt,
            likeCount: row.likeCount,
            commentCount: row.commentCount,
            quoteCount: row.quoteCount,
            tags: row.tags.map((tag) => tag.name),
            categories: row.category,
        }));
    }

    /**
     * Loads fully hydrated posts by their identifiers.
     *
     * Returns them in whatever order Postgres produces; the feed re-imposes
     * its ranking afterwards. Ids that no longer exist are simply missing from
     * the result - a post deleted between ranking and hydration must not fail
     * the request.
     *
     * @param ids - The post identifiers to load.
     * @param currentUserId - Optional viewer, used to resolve isLiked/isBookmarked.
     * @param excludeAuthorIds - Authors to drop even though their ids were
     * asked for. The feed hydrates from a ranked order it cached earlier, and
     * that order can predate a block by up to the snapshot's lifetime;
     * filtering here lets a stale snapshot heal itself, so blocking needs no
     * cache invalidation and the reader simply gets a shorter page that the
     * feed's existing top-up then fills.
     * @returns The posts that still exist and the viewer may see.
     */
    async findByIds(
        ids: string[],
        currentUserId?: string,
        excludeAuthorIds?: string[],
    ): Promise<Post[]> {
        if (ids.length === 0) return [];

        const rawPosts = await this.prisma.post.findMany({
            where: {
                id: { in: ids },
                ...this.authorFilter(undefined, undefined, excludeAuthorIds),
            },
            include: {
                author: POST_AUTHOR_SELECT,
                tags: true,
                mentionedUsers: MENTIONED_USERS_SELECT,
                likes: currentUserId
                    ? { where: { userId: currentUserId } }
                    : false,
                bookmarks: currentUserId
                    ? { where: { userId: currentUserId } }
                    : false,
                quotedPost: QUOTED_POST_INCLUDE,
            },
        });

        return rawPosts.map((post) =>
            PostPrismaMapper.toDomainPost(post as PostWithRelations),
        );
    }

    /**
     * Finds a post by its unique identifier, optionally including like and bookmark information for the current user.
     * @param id - The unique identifier of the post.
     * @param currentUserId - Optional ID of the current user to determine if they have liked or bookmarked the post.
     * @returns The Post entity if found, otherwise null.
     */
    async findById(id: string, currentUserId?: string): Promise<Post | null> {
        const raw = await this.prisma.post.findUnique({
            where: { id },
            include: {
                author: POST_AUTHOR_SELECT,
                tags: true,
                mentionedUsers: MENTIONED_USERS_SELECT,
                likes: currentUserId
                    ? { where: { userId: currentUserId } }
                    : false,
                bookmarks: currentUserId
                    ? { where: { userId: currentUserId } }
                    : false,
                quotedPost: QUOTED_POST_INCLUDE,
            },
        });

        if (!raw) return null;

        return PostPrismaMapper.toDomainPost(raw as PostWithRelations);
    }

    /**
     * Deletes a post by its unique identifier.
     * @param id - The unique identifier of the post to be deleted.
     * @returns A promise that resolves when the deletion is complete.
     */
    async delete(id: string): Promise<void> {
        await this.prisma.post.delete({
            where: { id },
        });
    }

    /**
     * Increments the comment count for a post by its unique identifier.
     * @param postId - The unique identifier of the post for which to increment the comment count.
     * @returns A promise that resolves when the update is complete.
     */
    async incrementCommentsCount(postId: string): Promise<void> {
        await this.prisma.post.update({
            where: { id: postId },
            data: { commentCount: { increment: 1 } },
        });
    }

    /**
     * Decrements the comment count for a post by its unique identifier.
     * @param postId - The unique identifier of the post for which to decrement the comment count.
     * @returns A promise that resolves when the update is complete.
     */
    async decrementCommentsCount(postId: string): Promise<void> {
        await this.prisma.post.update({
            where: { id: postId },
            data: { commentCount: { decrement: 1 } },
        });
    }

    /**
     * Overwrites the media state written by moderation.
     *
     * @param id - The id of the content to update
     * @param state - The media list and moderation flags to store
     */
    async updateMediaState(id: string, state: MediaState): Promise<void> {
        // updateMany, so content deleted while its video was in flight matches
        // nothing instead of raising. An update that throws here would send the
        // worker down the retry path and eventually reject - and delete - media
        // whose owner is already gone, then tell the author about it.
        await this.prisma.post.updateMany({
            where: { id },
            data: {
                mediaUrls: state.mediaUrls,
                isSensitive: state.isSensitive,
                mediaStatus: state.mediaStatus,
            },
        });
    }

    /**
     * Increments the quote count for a post by its unique identifier.
     * @param postId - The unique identifier of the post that was quoted.
     * @returns A promise that resolves when the update is complete.
     */
    async incrementQuoteCount(postId: string): Promise<void> {
        await this.prisma.post.update({
            where: { id: postId },
            data: { quoteCount: { increment: 1 } },
        });
    }

    /**
     * Decrements the quote count for a post by its unique identifier.
     * @param postId - The unique identifier of the post whose quote was deleted.
     * @returns A promise that resolves when the update is complete.
     */
    async decrementQuoteCount(postId: string): Promise<void> {
        await this.prisma.post.update({
            where: { id: postId },
            data: { quoteCount: { decrement: 1 } },
        });
    }

    /**
     * Finds posts by the author's username with pagination and optional type filtering.
     * @param username - The username of the author whose posts are being retrieved.
     * @param page - The page number for pagination.
     * @param limit - The number of posts to retrieve per page.
     * @param type - Optional filter to retrieve posts of a specific type.
     * @param currentUserId - Optional ID of the current user to determine if they have liked or bookmarked the posts.
     * @returns An object containing the array of Post entities and the total count of posts matching the criteria.
     */
    async findByAuthorUsername(
        username: string,
        page: number,
        limit: number,
        type?: string,
        currentUserId?: string,
        excludeAuthorIds?: string[],
    ): Promise<{ posts: Post[]; total: number }> {
        const skip = (page - 1) * limit;

        const whereClause: Prisma.PostWhereInput = {
            author: {
                username: username,
            },
            // A blocked author matches nothing here, so the profile answers
            // with an empty timeline rather than a 404. That is the shape the
            // client wants: the profile itself still renders, saying who
            // blocked whom, with nothing under it.
            ...this.authorFilter(undefined, undefined, excludeAuthorIds),
        };

        if (type) {
            whereClause.type = type as PostType;
        }

        const [total, rawPosts] = await Promise.all([
            this.prisma.post.count({ where: whereClause }),
            this.prisma.post.findMany({
                where: whereClause,
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
                include: {
                    author: POST_AUTHOR_SELECT,
                    tags: true,
                    mentionedUsers: MENTIONED_USERS_SELECT,
                    likes: currentUserId
                        ? { where: { userId: currentUserId } }
                        : false,
                    bookmarks: currentUserId
                        ? { where: { userId: currentUserId } }
                        : false,
                    quotedPost: QUOTED_POST_INCLUDE,
                },
            }),
        ]);

        const posts = rawPosts.map((raw) =>
            PostPrismaMapper.toDomainPost(raw as PostWithRelations),
        );

        return { posts, total };
    }

    /**
     * Counts total posts by a specific user.
     * @param userId - The ID of the user whose posts are being counted.
     * @returns The total number of posts by the user.
     */
    async countByUserId(userId: string): Promise<number> {
        return this.prisma.post.count({ where: { authorId: userId } });
    }
}
