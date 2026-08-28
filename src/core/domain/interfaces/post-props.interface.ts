import type { PostType } from "@core/domain/enums";
import type { PostCategory } from "../enums/post-category-enum";

/**
 * Props interface for Post entity
 *
 * Represents the properties required to create or update a post.
 * Posts are the main content entities in the application that users
 * can create, share, and interact with through likes and comments.
 */
export interface PostProps {
    /** Optional unique identifier for the post, auto-generated if not provided */
    id?: string;

    /** The main content text of the post */
    content: string;

    /** The type of post (text, image, video, etc.) */
    type: PostType;

    /** Array of media URLs associated with the post (images, videos, etc.) */
    mediaUrls: string[];

    /** Author information including user ID and optional display details */
    author: {
        /** The unique identifier of the user who created this post */
        id: string;

        /**
         * Handle of the author.
         *
         * Absent only on a post built by `Post.create` that has not been
         * persisted yet, which carries the author id and nothing else. Any
         * post read back from the database has one: `User.username` is NOT
         * NULL and the author relation is required, and every query that
         * loads a post selects it. The response mappers rely on that.
         */
        username?: string;

        /** Optional avatar URL of the author for display purposes */
        avatarUrl?: string;

        /**Optional fullName URL of the author for display name */
        fullName?: string;

        isMe?: boolean;
    };

    /** Array of tags associated with the post for categorization and discovery */
    tags: string[];

    /** Optional creation timestamp, defaults to current time if not provided */
    createdAt?: Date;

    /** Optional last update timestamp, defaults to current time if not provided */
    updatedAt?: Date;

    /** Optional like count for the post */
    likeCount?: number;

    /** Optional comment count for the post */
    commentCount?: number;

    /** Indicates if the current authenticated user has bookmarked this post */
    isBookmarked?: boolean;

    /** Indicates if the current authenticated user has liked this post */
    isLiked?: boolean;

    /** Array of categories associated with the post */
    categories: PostCategory[];
}
