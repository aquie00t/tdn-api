/**
 * Repository interface for comment data operations
 * Handles CRUD operations for comments and nested comment relationships
 */
import type { Comment } from "@core/domain/entities/comment.entity";

/** What a comment can be attached to. */
export type CommentTargetType = "POST" | "ARTICLE";

/**
 * A comment target: the kind of thing being commented on, and its id.
 *
 * Callers pass this instead of a bare id so a post id can never be read as an
 * article id by a signature that takes both.
 */
export interface CommentTarget {
    /** Whether the comment hangs off a post or an article */
    type: CommentTargetType;

    /** Identifier of the post or article */
    id: string;
}

export interface ICommentRepository {
    /**
     * Creates a new comment and increments the post's comment count
     * @param comment - The comment entity to create
     * @returns Promise that resolves when the comment is created
     */
    create(comment: Comment): Promise<Comment>;

    /**
     * Finds a comment by its unique identifier
     * @param id - The comment ID to search for
     * @param currentUserId - Optional ID of the current user for like/bookmark status
     * @returns Promise that resolves to the comment or null if not found
     */
    findById(id: string, currentUserId?: string): Promise<Comment | null>;

    /**
     * Retrieves top-level comments for a post (where parentId is null)
     *
     * @deprecated Prefer findTopLevelByTarget; kept so the post comment path
     * is untouched by the polymorphic change, and removed once that path moves
     * over.
     * @param postId - The ID of the post to get comments for
     * @param limit - Maximum number of comments to return
     * @param offset - Number of comments to skip for pagination
     * @param currentUserId - Optional ID of the current user for like/bookmark status
     * @returns Promise that resolves to an array of top-level comments
     */
    findTopLevelByPostId(
        postId: string,
        limit: number,
        offset: number,
        currentUserId?: string,
    ): Promise<Comment[]>;

    /**
     * Retrieves top-level comments for a post or an article
     * @param target - What the comments are attached to
     * @param limit - Maximum number of comments to return
     * @param offset - Number of comments to skip for pagination
     * @param currentUserId - Optional ID of the current user for like/bookmark status
     * @returns Promise that resolves to an array of top-level comments
     */
    findTopLevelByTarget(
        target: CommentTarget,
        limit: number,
        offset: number,
        currentUserId?: string,
    ): Promise<Comment[]>;

    /**
     * Counts the comments attached to a post or an article, replies included
     * @param target - What the comments are attached to
     * @returns Promise that resolves to the number of comments
     */
    countByTarget(target: CommentTarget): Promise<number>;

    /**
     * Retrieves replies for a specific parent comment
     * @param parentId - The ID of the parent comment
     * @param limit - Maximum number of replies to return
     * @param offset - Number of replies to skip for pagination
     * @param currentUserId - Optional ID of the current user for like/bookmark status
     * @returns Promise that resolves to an array of reply comments
     */
    findRepliesByParentId(
        parentId: string,
        limit: number,
        offset: number,
        currentUserId?: string,
    ): Promise<Comment[]>;

    /**
     * Deletes a comment and decrements the post's comment count
     * Note: Cascade will handle replies, but we need to decrement count
     * @param id - The ID of the comment to delete
     * @returns Promise that resolves when the comment is deleted
     */
    delete(id: string): Promise<void>;

    /**
     * Checks whether a user has liked a specific comment
     * @param commentId - The ID of the comment to check
     * @param userId - The ID of the user to check
     * @returns True if the user has liked the comment, false otherwise
     */
    hasUserLiked(commentId: string, userId: string): Promise<boolean>;

    /**
     * Records a like on a comment by a user
     * @param commentId - The ID of the comment to like
     * @param userId - The ID of the user liking the comment
     */
    addLike(commentId: string, userId: string): Promise<void>;

    /**
     * Removes a like from a comment by a user
     * @param commentId - The ID of the comment to unlike
     * @param userId - The ID of the user removing the like
     */
    removeLike(commentId: string, userId: string): Promise<void>;

    /**
     * Increments the cached like count of a comment by one
     * @param commentId - The ID of the comment to update
     */
    incrementLikeCount(commentId: string): Promise<void>;

    /**
     * Decrements the cached like count of a comment by one
     * @param commentId - The ID of the comment to update
     */
    decrementLikeCount(commentId: string): Promise<void>;

    /**
     * Increments the cached reply count of a comment by one
     * @param commentId - The ID of the comment to update
     */
    incrementRepliesCount(commentId: string): Promise<void>;

    /**
     * Decrements the cached reply count of a comment by one
     * @param commentId - The ID of the comment to update
     */
    decrementRepliesCount(commentId: string): Promise<void>;
}
