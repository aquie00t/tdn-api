/**
 * Interface defining the properties of a comment entity
 * Supports nested comments through optional parent-child relationships
 */
export interface CommentProps {
    /**
     * Unique identifier of the comment (optional for new comments)
     */
    id?: string;

    /**
     * The text content of the comment
     */
    content: string;

    /**
     * ID of the post this comment belongs to.
     *
     * Null when the comment belongs to an article instead. Exactly one of
     * postId and articleId is set; the database enforces it with a CHECK
     * constraint.
     */
    postId: string | null;

    /**
     * ID of the article this comment belongs to, or null when it belongs to a
     * post.
     */
    articleId: string | null;

    /**
     * ID of the user who authored this comment
     */
    authorId: string;

    /**
     * ID of the parent comment if this is a nested comment
     * Null for top-level comments
     */
    parentId: string | null;

    /**
     * Creation timestamp of the comment (optional for new comments)
     */
    createdAt?: Date;

    /**
     * Last update timestamp of the comment (optional for new comments)
     */
    updatedAt?: Date;

    /**
     * Author details of the comment (optional, populated on retrieval)
     */
    author?: {
        /** Unique identifier of the author */
        id: string;
        /** Display username of the author */
        username?: string;
        /** URL of the author's avatar image */
        avatarUrl?: string;
        /** Full name of the author */
        fullName?: string;
    };

    /**
     * Total number of likes the comment has received
     */
    likeCount?: number;

    /**
     * Total number of replies to the comment
     */
    replyCount?: number;

    /**
     * Whether the current user has liked the comment
     */
    isLiked?: boolean;

    /**
     * Whether the current user has bookmarked the comment
     */
    isBookmarked?: boolean;

    /**
     * Array of media URLs attached to the comment
     */
    mediaUrls?: string[];
}
