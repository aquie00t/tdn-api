import { Article } from "@core/domain/entities/article.entity";
import { isVerified } from "@core/use-cases/shared/verification/is-verified";
import type { ArticleStatus } from "@core/domain/enums";
import type { PostCategory } from "@core/domain/enums/post-category-enum";
import type { MentionedUser } from "@core/domain/interfaces/mentioned-user.interface";
import type { Prisma } from "@generated/prisma/client";

export type ArticleWithRelations = Prisma.ArticleGetPayload<{
    include: {
        author: {
            select: {
                id: true;
                username: true;
                verifiedUntil: true;
                profile: { select: { avatarUrl: true; fullName: true } };
            };
        };
        tags: true;
        mentionedUsers: { select: { id: true; username: true } };
        likes: true;
        bookmarks: true;
        _count: { select: { comments: true } };
    };
}>;

export interface ArticleResponse {
    id: string;
    slug: string;
    title: string;
    body: string;
    excerpt: string | null;
    coverImageUrl: string | null;
    coverImageAlt: string | null;
    /** True when the client should blur the cover behind a tap. */
    isSensitive: boolean;
    status: string;
    publishedAt: Date | null;
    readingTimeMinutes: number;
    createdAt: Date;
    updatedAt: Date;
    likeCount: number;
    commentCount: number;
    isLiked: boolean;
    isBookmarked: boolean;
    author: {
        id: string;
        username: string;
        avatarUrl: string;
        fullName: string | null;
        isMe: boolean;
        isVerified: boolean;
    };
    tags: { name: string }[];
    /** Users named with an @handle in the body, resolved at write time. */
    mentions: MentionedUser[];
    categories: { name: string }[];
}

/**
 * The shape list endpoints return: everything except the markdown body.
 *
 * Declared as an Omit rather than a hand-written twin so a field added to the
 * detail response cannot be forgotten here.
 */
export type ArticleSummaryResponse = Omit<ArticleResponse, "body">;

/**
 * Mapper responsible for transforming Article data across layers.
 *
 * The markdown body passes through untouched in every direction. The API never
 * renders it to HTML, so there is no escaping step here — clients are required
 * to render with a sanitizing renderer.
 */
export class ArticlePrismaMapper {
    /**
     * Maps a Prisma record to the domain entity.
     *
     * The viewer flags are derived from the relation arrays, which the
     * repository includes scoped to the current user (`where: { userId }`) or
     * omits entirely for guests — so an empty array means "not liked" rather
     * than "unknown".
     *
     * @param dbArticle - The Prisma record with its relations loaded
     * @returns The Article domain entity
     */
    static toDomainArticle(dbArticle: ArticleWithRelations): Article {
        return Article.with({
            id: dbArticle.id,
            slug: dbArticle.slug,
            title: dbArticle.title,
            body: dbArticle.body,
            excerpt: dbArticle.excerpt,
            coverImageKey: dbArticle.coverImageKey,
            coverImageAlt: dbArticle.coverImageAlt,
            isSensitive: dbArticle.isSensitive,
            status: dbArticle.status as ArticleStatus,
            publishedAt: dbArticle.publishedAt,
            readingTimeMinutes: dbArticle.readingTimeMinutes,
            author: {
                id: dbArticle.authorId,
                username: dbArticle.author.username,
                avatarUrl: dbArticle.author?.profile?.avatarUrl ?? undefined,
                fullName: dbArticle.author?.profile?.fullName ?? undefined,
                isVerified: isVerified(dbArticle.author.verifiedUntil),
            },
            tags: dbArticle.tags?.map((tag) => tag.name) ?? [],
            mentions: dbArticle.mentionedUsers ?? [],
            categories: (dbArticle.category as PostCategory[]) || [],
            createdAt: dbArticle.createdAt,
            updatedAt: dbArticle.updatedAt,
            likeCount: dbArticle.likeCount,
            // Derived rather than denormalized: a counter column would drift
            // the way posts.comment_count does, since the reply subtree is
            // removed by a database cascade the application never sees.
            commentCount: dbArticle._count?.comments ?? 0,
            isLiked: Boolean(dbArticle.likes && dbArticle.likes.length > 0),
            isBookmarked: Boolean(
                dbArticle.bookmarks && dbArticle.bookmarks.length > 0,
            ),
        });
    }

    /**
     * Maps a domain entity onto the flat shape Prisma writes.
     *
     * Tags and mentions are excluded: the repository attaches them, with
     * connectOrCreate and connect respectively.
     *
     * @param article - The Article domain entity
     * @returns The scalar fields of an article row
     */
    static toPrismaArticle(
        article: Article,
    ): Omit<
        Prisma.ArticleUncheckedCreateInput,
        "id" | "tags" | "mentionedUsers"
    > {
        return {
            slug: article.slug,
            title: article.title,
            body: article.body,
            excerpt: article.excerpt,
            coverImageKey: article.coverImageKey,
            coverImageAlt: article.coverImageAlt,
            isSensitive: article.isSensitive,
            status: article.status,
            publishedAt: article.publishedAt,
            readingTimeMinutes: article.readingTimeMinutes,
            category: article.categories,
            authorId: article.author.id,
        };
    }

    /**
     * Maps a domain entity to the list-sized response, without the body.
     *
     * List endpoints return this shape: an article body can be 100 KB, and a
     * page of fifty of them is megabytes of markdown nobody rendered. The
     * cover image is stored as a storage key and only becomes a URL here,
     * which is what keeps arbitrary client-supplied URLs out of the database.
     *
     * Every shared field lives here rather than in both builders, so the
     * summary and the detail shape cannot drift apart.
     *
     * @param article - The Article domain entity
     * @param cdnUrl - CDN base URL, without a trailing slash
     * @param currentUserId - Viewer used to resolve the isMe flag
     * @returns A response object safe to serialize, minus the markdown body
     */
    static toSummaryResponse(
        article: Article,
        cdnUrl: string,
        currentUserId?: string,
    ): ArticleSummaryResponse {
        // Only an article built by Article.create and not yet persisted lacks
        // a handle; those never reach a response. Failing here beats
        // serialising an article with no author handle on it.
        const { username } = article.author;
        if (!username) {
            throw new Error(
                "ArticlePrismaMapper.toSummaryResponse requires an article loaded with its author.",
            );
        }

        return {
            id: article.id,
            slug: article.slug,
            title: article.title,
            excerpt: article.excerpt,
            coverImageUrl: article.coverImageKey
                ? `${cdnUrl}/${article.coverImageKey}`
                : null,
            coverImageAlt: article.coverImageAlt,
            // True when moderation judged the cover borderline; the client
            // blurs it behind a tap.
            isSensitive: article.isSensitive,
            status: article.status,
            publishedAt: article.publishedAt,
            readingTimeMinutes: article.readingTimeMinutes,
            createdAt: article.createdAt,
            updatedAt: article.updatedAt,
            likeCount: article.likeCount,
            commentCount: article.commentCount,
            isLiked: article.isLiked,
            isBookmarked: article.isBookmarked,
            author: {
                id: article.author.id,
                username,
                isVerified: article.author.isVerified ?? false,
                avatarUrl: article.author.avatarUrl
                    ? article.author.avatarUrl.startsWith("http")
                        ? article.author.avatarUrl
                        : article.author.avatarUrl.includes("default_profile")
                          ? `${cdnUrl}/${article.author.avatarUrl}?v=1`
                          : `${cdnUrl}/${article.author.avatarUrl}`
                    : `${cdnUrl}/default-avatar.png`,
                fullName: article.author.fullName ?? null,
                isMe: currentUserId
                    ? article.author.id === currentUserId
                    : false,
            },
            tags: article.tags.map((name) => ({ name })),
            mentions: article.mentions,
            categories: article.categories.map((name) => ({ name })),
        };
    }

    /**
     * Maps a domain entity to the full API response, body included.
     *
     * Used by the detail endpoint and by create, update, publish and archive,
     * where the caller is working with one article and wants its markdown.
     *
     * @param article - The Article domain entity
     * @param cdnUrl - CDN base URL, without a trailing slash
     * @param currentUserId - Viewer used to resolve the isMe flag
     * @returns A response object safe to serialize
     */
    static toResponse(
        article: Article,
        cdnUrl: string,
        currentUserId?: string,
    ): ArticleResponse {
        return {
            ...this.toSummaryResponse(article, cdnUrl, currentUserId),
            body: article.body,
        };
    }

    /**
     * Maps a list of domain entities to list-sized API responses.
     *
     * @param articles - The Article domain entities
     * @param cdnUrl - CDN base URL, without a trailing slash
     * @param currentUserId - Viewer used to resolve the isMe flag
     * @returns The response objects, without their markdown bodies
     */
    static toListResponse(
        articles: Article[],
        cdnUrl: string,
        currentUserId?: string,
    ): ArticleSummaryResponse[] {
        return articles.map((article) =>
            this.toSummaryResponse(article, cdnUrl, currentUserId),
        );
    }
}
