import type { MediaModerationStatus } from "@core/domain/enums";
import type { MentionedUser } from "./mentioned-user.interface";

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
        /**
         * Handle of the author. Always present once the author is loaded:
         * `User.username` is NOT NULL and the author relation is required.
         */
        username: string;
        /** URL of the author's avatar image */
        avatarUrl?: string;
        /** Full name of the author */
        fullName?: string;
    };

    /**
     * Users named with an @handle in the content, resolved at write time
     */
    mentions: MentionedUser[];

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

    /**
     * True when moderation judged the attached media borderline rather than
     * forbidden. The comment is served as normal and the client blurs the media.
     */
    isSensitive?: boolean;

    /**
     * Moderation state of the comment's own media.
     *
     * APPROVED for a text-only comment, and for one whose media has all been
     * judged. PENDING while an attached video is still being scanned, and in
     * that state the read path withholds the media and serves the text. A
     * rejected file is dropped from `mediaUrls` rather than recorded here.
     */
    mediaStatus?: MediaModerationStatus;
}
