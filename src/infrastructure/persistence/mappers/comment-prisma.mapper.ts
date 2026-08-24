import type { Prisma } from "@generated/prisma/client";
import { Comment } from "@core/domain/entities/comment.entity";

export type CommentWithRelations = Prisma.CommentGetPayload<{
    include: {
        author: {
            select: {
                id: true;
                username: true;
                profile: { select: { avatarUrl: true; fullName: true } };
            };
        };
        likes: true;
        bookmarks: true;
    };
}>;

export interface CommentResponse {
    id: string;
    content: string;

    /**
     * The post this comment belongs to, or null when it belongs to an article.
     *
     * Nullable in lockstep with the response schema: fast-json-stringify
     * coerces rather than rejects, so a schema that still promised a string
     * would emit a wrong value instead of failing loudly.
     */
    postId: string | null;

    /** The article this comment belongs to, or null when it belongs to a post */
    articleId: string | null;

    mediaUrls: string[];
    parentId: string | null;
    createdAt: Date;
    author: {
        id: string;
        username?: string;
        fullName?: string;
        avatarUrl: string;
        isMe: boolean;
    };
    likeCount: number;
    replyCount: number;
    isLiked: boolean;
    isBookmarked: boolean;
}

/**
 * Mapper class responsible for transforming Comment data across different layers.
 */
export class CommentPrismaMapper {
    /**
     * Maps a Prisma database record to a core Domain entity.
     */
    static toDomainComment(dbComment: CommentWithRelations): Comment {
        return Comment.with({
            id: dbComment.id,
            content: dbComment.content,
            postId: dbComment.postId,
            articleId: dbComment.articleId,
            authorId: dbComment.authorId,
            parentId: dbComment.parentId,
            mediaUrls: dbComment.mediaUrls,
            createdAt: dbComment.createdAt,
            updatedAt: dbComment.updatedAt,

            author: {
                id: dbComment.authorId,
                username: dbComment.author?.username ?? undefined,
                avatarUrl: dbComment.author?.profile?.avatarUrl ?? undefined,
                fullName: dbComment.author?.profile?.fullName ?? undefined,
            },
            likeCount: dbComment.likeCount,
            replyCount: dbComment.replyCount,
            isLiked: dbComment.likes && dbComment.likes.length > 0,
            isBookmarked: dbComment.bookmarks && dbComment.bookmarks.length > 0,
        });
    }

    static toResponse(
        comment: Comment,
        cdnUrl: string,
        currentUserId?: string,
    ): CommentResponse {
        return {
            id: comment.id,
            content: comment.content,
            postId: comment.postId,
            articleId: comment.articleId,
            parentId: comment.parentId,
            mediaUrls: comment.mediaUrls,
            createdAt: comment.createdAt,
            likeCount: comment.likeCount,
            replyCount: comment.replyCount,
            isLiked: comment.isLiked,
            isBookmarked: comment.isBookmarked,
            author: {
                id: comment.authorId,
                username: comment.author?.username,
                fullName: comment.author?.fullName ?? undefined,
                avatarUrl: comment.author?.avatarUrl
                    ? comment.author.avatarUrl.startsWith("http")
                        ? comment.author.avatarUrl
                        : comment.author.avatarUrl.includes("default_profile")
                          ? `${cdnUrl}/${comment.author.avatarUrl}?v=1`
                          : `${cdnUrl}/${comment.author.avatarUrl}`
                    : `${cdnUrl}/default-avatar.png`,
                isMe: currentUserId
                    ? comment.authorId === currentUserId
                    : false,
            },
        };
    }

    static toListResponse(
        comments: Comment[],
        cdnUrl: string,
        currentUserId?: string,
    ): CommentResponse[] {
        return comments.map((comment) =>
            this.toResponse(comment, cdnUrl, currentUserId),
        );
    }
}
