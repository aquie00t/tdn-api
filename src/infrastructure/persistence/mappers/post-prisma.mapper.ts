import { Post } from "@core/domain/entities/post.entity";
import type { PostCategory } from "@core/domain/enums/post-category-enum";
import type { PostType } from "@core/domain/enums/post-type.enum";
import type { Prisma } from "@generated/prisma/client";

export type PostWithRelations = Prisma.PostGetPayload<{
    include: {
        author: {
            select: {
                id: true;
                username: true;
                profile: { select: { avatarUrl: true; fullName: true } };
            };
        };
        tags: true;
        likes: true;
        bookmarks: true;
        quotedPost: {
            include: {
                author: {
                    select: {
                        id: true;
                        username: true;
                        profile: {
                            select: { avatarUrl: true; fullName: true };
                        };
                    };
                };
            };
        };
    };
}>;

/**
 * The quoted post as it is rendered inside a quote post.
 *
 * Deliberately leaner than {@link PostResponse}: no counters and no
 * viewer-specific `isLiked` / `isBookmarked`, so embedding one costs no extra
 * joins, and no nested `quotedPost`, so the embed never recurses.
 */
export interface QuotedPostResponse {
    id: string;
    content: string;
    mediaUrls: string[];
    createdAt: Date;
    author: {
        id: string;
        username: string;
        avatarUrl: string;
        fullName: string | null;
    };
}

export interface PostResponse {
    id: string;
    content: string;
    type: string;
    mediaUrls: string[];
    createdAt: Date;
    likeCount: number;
    commentCount: number;
    author: {
        id: string;
        username: string;
        avatarUrl: string;
        isMe?: boolean;
        fullName: string | null;
    };
    isLiked: boolean;
    isBookmarked: boolean;
    tags?: { name: string }[];
    categories?: { name: string }[];
    quotedPost: QuotedPostResponse | null;
}

/**
 * Mapper class responsible for transforming Post data across different layers.
 * Handles conversions between Prisma database records, Domain entities, and safe Response objects.
 */
export class PostPrismaMapper {
    /**
     * Maps a Prisma database record to a core Domain entity.
     *
     * @param dbPost - The post record retrieved from the Prisma database with relations.
     * @returns The instantiated Post domain entity.
     */
    static toDomainPost(dbPost: PostWithRelations): Post {
        return Post.with({
            id: dbPost.id,
            content: dbPost.content,
            type: dbPost.type as PostType,
            mediaUrls: dbPost.mediaUrls,

            author: {
                id: dbPost.authorId,
                username: dbPost.author.username,
                avatarUrl: dbPost.author?.profile?.avatarUrl ?? undefined,
                fullName: dbPost.author?.profile?.fullName ?? undefined,
            },

            tags: dbPost.tags?.map((t) => t.name) || [],
            createdAt: dbPost.createdAt,
            updatedAt: dbPost.updatedAt,
            likeCount: dbPost.likeCount,
            commentCount: dbPost.commentCount,
            isLiked: dbPost.likes && dbPost.likes.length > 0,
            isBookmarked: dbPost.bookmarks && dbPost.bookmarks.length > 0,
            categories: (dbPost.category as PostCategory[]) || [],
            quotedPostId: dbPost.quotedPostId ?? undefined,
            quotedPost: dbPost.quotedPost
                ? {
                      id: dbPost.quotedPost.id,
                      content: dbPost.quotedPost.content,
                      mediaUrls: dbPost.quotedPost.mediaUrls,
                      createdAt: dbPost.quotedPost.createdAt,
                      author: {
                          id: dbPost.quotedPost.authorId,
                          username: dbPost.quotedPost.author.username,
                          avatarUrl:
                              dbPost.quotedPost.author?.profile?.avatarUrl ??
                              undefined,
                          fullName:
                              dbPost.quotedPost.author?.profile?.fullName ??
                              undefined,
                      },
                  }
                : undefined,
        });
    }

    /**
     * Maps domain entity data to a Prisma-compatible object.
     *
     * @param post - The Post domain entity.
     * @returns The Prisma-formatted input object for database operations.
     */
    static toPrismaPost(post: Post): {
        content: string;
        type: PostType;
        mediaUrls: string[];
        authorId: string;
        category: PostCategory[];
        quotedPostId: string | null;
    } {
        return {
            content: post.content,
            type: post.type as PostType,
            mediaUrls: post.mediaUrls,
            authorId: post.author.id,
            category: post.categories || [],
            quotedPostId: post.quotedPostId ?? null,
        };
    }

    /**
     * Maps a Domain entity to a safe public response object.
     * Formats avatar URLs and includes user-specific interaction states (likes/bookmarks).
     *
     * @param post - The Post domain entity.
     * @param cdnUrl - Base URL for the CDN to resolve media links.
     * @returns A sanitized post object safe for external API responses.
     */
    static toResponse(
        post: Post,
        cdnUrl: string,
        currentUserId?: string,
    ): PostResponse {
        // Only a post built by Post.create and not yet persisted lacks a
        // handle; those never reach a response. Failing here beats serialising
        // a post with no author handle on it.
        const { username } = post.author;
        if (!username) {
            throw new Error(
                "PostPrismaMapper.toResponse requires a post loaded with its author.",
            );
        }

        return {
            id: post.id,
            content: post.content,
            type: post.type,
            mediaUrls: post.mediaUrls,
            createdAt: post.createdAt,
            likeCount: post.likeCount || 0,
            commentCount: post.commentCount || 0,
            isLiked: post.isLiked || false,
            isBookmarked: post.isBookmarked || false,
            author: {
                id: post.author.id,
                username,
                avatarUrl: this.resolveAvatarUrl(post.author.avatarUrl, cdnUrl),
                fullName: post.author.fullName ?? null,
                isMe: currentUserId ? post.author.id === currentUserId : false,
            },
            tags: post.tags?.map((t) => ({ name: t })) || [],
            categories: post.categories?.map((c) => ({ name: c })) || [],
            quotedPost: this.toQuotedPostResponse(post, cdnUrl),
        };
    }

    /**
     * Maps the quoted post carried by a quote post to its response card.
     *
     * @param post - The quoting Post domain entity.
     * @param cdnUrl - Base URL for the CDN to resolve avatar links.
     * @returns The embedded quote card, or null when the post quotes nothing.
     *
     * @remarks
     * Unlike {@link toResponse} this never throws on a missing handle. The
     * relation makes an author mandatory, so a card without one cannot exist,
     * and a defensive empty handle is a better outcome here than failing the
     * whole feed over one embedded post.
     */
    private static toQuotedPostResponse(
        post: Post,
        cdnUrl: string,
    ): QuotedPostResponse | null {
        const quoted = post.quotedPost;
        if (!quoted) return null;

        return {
            id: quoted.id,
            content: quoted.content,
            mediaUrls: quoted.mediaUrls,
            createdAt: quoted.createdAt,
            author: {
                id: quoted.author.id,
                username: quoted.author.username ?? "",
                avatarUrl: this.resolveAvatarUrl(
                    quoted.author.avatarUrl,
                    cdnUrl,
                ),
                fullName: quoted.author.fullName ?? null,
            },
        };
    }

    /**
     * Resolves a stored avatar key onto the CDN.
     *
     * An absolute URL is left alone - OAuth avatars point at the provider -
     * the seeded default gets a cache-busting suffix, and anything else is a
     * key under the CDN base. Shared by the post's author and the quoted
     * post's author so the two can never drift apart.
     *
     * @param avatarUrl - The stored avatar key or URL, if any.
     * @param cdnUrl - Base URL for the CDN.
     * @returns A URL the client can render directly.
     */
    private static resolveAvatarUrl(
        avatarUrl: string | undefined,
        cdnUrl: string,
    ): string {
        if (!avatarUrl) return `${cdnUrl}/default-avatar.png`;
        if (avatarUrl.startsWith("http")) return avatarUrl;
        if (avatarUrl.includes("default_profile")) {
            return `${cdnUrl}/${avatarUrl}?v=1`;
        }
        return `${cdnUrl}/${avatarUrl}`;
    }

    /**
     * Maps an array of Domain entities to safe public response objects.
     *
     * @param posts - Array of Post domain entities.
     * @param cdnUrl - Base URL for the CDN to resolve media links.
     * @returns An array of sanitized post objects safe for external API responses.
     */
    static toFeedResponse(
        posts: Post[],
        cdnUrl: string,
        currentUserId?: string,
    ): PostResponse[] {
        return posts.map((post) =>
            this.toResponse(post, cdnUrl, currentUserId),
        );
    }
}
