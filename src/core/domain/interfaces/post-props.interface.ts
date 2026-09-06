import type { MediaModerationStatus, PostType } from "@core/domain/enums";
import type { PostCategory } from "../enums/post-category-enum";
import type { MentionedUser } from "./mentioned-user.interface";
import type { QuotedPostSnapshot } from "./quoted-post.interface";

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

        /**
         * Whether the author currently carries the paid verification badge.
         *
         * Derived from `User.verifiedUntil` at read time rather than stored,
         * so one that has run out disappears without anything noticing.
         */
        isVerified?: boolean;

        isMe?: boolean;
    };

    /** Array of tags associated with the post for categorization and discovery */
    tags: string[];

    /** Users named with an @handle in the content, resolved at write time */
    mentions: MentionedUser[];

    /** Optional creation timestamp, defaults to current time if not provided */
    createdAt?: Date;

    /** Optional last update timestamp, defaults to current time if not provided */
    updatedAt?: Date;

    /** Optional like count for the post */
    likeCount?: number;

    /** Optional comment count for the post */
    commentCount?: number;

    /** Optional count of posts quoting this one */
    quoteCount?: number;

    /** Indicates if the current authenticated user has bookmarked this post */
    isBookmarked?: boolean;

    /** Indicates if the current authenticated user has liked this post */
    isLiked?: boolean;

    /** Array of categories associated with the post */
    categories: PostCategory[];

    /**
     * BCP-47 language code the content was detected to be in.
     *
     * Null when the detector could not tell and undefined when the post was
     * loaded through a projection that does not carry it. Both mean "unknown"
     * to the feed ranker, which scores such a post as language-neutral rather
     * than dropping it.
     */
    lang?: string | null;

    /**
     * True when moderation judged the attached media borderline rather than
     * forbidden. The post is served as normal and the client blurs the media.
     */
    isSensitive?: boolean;

    /**
     * Moderation state of the post's own media.
     *
     * APPROVED for a text-only post, and for one whose media has all been
     * judged. PENDING while an attached video is still being scanned, and in
     * that state the read path withholds the media and serves the text. A
     * rejected file is dropped from `mediaUrls` rather than recorded here.
     */
    mediaStatus?: MediaModerationStatus;

    /**
     * The post this one quotes, when it is a quote post.
     *
     * Only ever the id on a post built by `Post.create`; a post read back from
     * the database carries `quotedPost` alongside it.
     */
    quotedPostId?: string;

    /**
     * The embedded snapshot of the quoted post.
     *
     * Present only when the post was loaded with its quote relation. A quote
     * of a quote carries one level and no more - see {@link QuotedPostSnapshot}.
     */
    quotedPost?: QuotedPostSnapshot;
}
