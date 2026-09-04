import type { ArticleStatus } from "@core/domain/enums";
import type { PostCategory } from "../enums/post-category-enum";
import type { MentionedUser } from "./mentioned-user.interface";

/**
 * Props interface for the Article entity.
 *
 * Articles are Medium-style long-form content: a markdown body, a cover image,
 * tags and a draft/publish lifecycle. Unlike Post, the body is never rendered
 * to HTML by the API — it is stored and returned as raw markdown.
 */
export interface ArticleProps {
    /** Optional unique identifier, assigned by the database on create */
    id?: string;

    /** URL-safe identifier derived from the title, immutable once assigned */
    slug: string;

    /** Human-readable title, at most 160 characters */
    title: string;

    /** Raw markdown body. Never HTML — see the security notes in the mapper */
    body: string;

    /** Short summary, author-supplied or derived from the body */
    excerpt: string | null;

    /** Storage key of the cover image (not a URL); CDN base is added on response */
    coverImageKey: string | null;

    /** Accessibility text for the cover image */
    coverImageAlt: string | null;

    /**
     * True when moderation judged the cover borderline rather than forbidden.
     * The article is served as normal; the client blurs the cover.
     *
     * A cover is always an image and is therefore scanned inside the upload
     * request, so there is no pending state to represent here - a forbidden
     * cover never reached storage to be referenced in the first place.
     */
    isSensitive?: boolean;

    /** Lifecycle state controlling who may read the article */
    status: ArticleStatus;

    /** Timestamp of the first publish, null while the article is a draft */
    publishedAt: Date | null;

    /** Estimated reading time in minutes, derived from the body */
    readingTimeMinutes: number;

    /** Author information including user ID and optional display details */
    author: {
        /** The unique identifier of the user who wrote this article */
        id: string;

        /**
         * Handle of the author.
         *
         * Absent only on an article built by `Article.create` that has not
         * been persisted yet, which carries the author id and nothing else.
         * Any article read back from the database has one: `User.username` is
         * NOT NULL and the author relation is required, and every query builds
         * its include through `buildInclude`, which selects it.
         */
        username?: string;

        /** Optional avatar URL of the author for display purposes */
        avatarUrl?: string;

        /** Optional full name of the author for display purposes */
        fullName?: string;

        /** Indicates whether the author is the current authenticated user */
        isMe?: boolean;
    };

    /** Tag names attached to the article, supplied explicitly by the author */
    tags: string[];

    /** Users named with an @handle in the body, re-resolved on every body edit */
    mentions: MentionedUser[];

    /** Categories associated with the article */
    categories: PostCategory[];

    /** Optional creation timestamp */
    createdAt?: Date;

    /** Optional last update timestamp */
    updatedAt?: Date;

    /** Cached like count, denormalized so it can be used as an ordering column */
    likeCount?: number;

    /** Comment count, derived from a relation count rather than denormalized */
    commentCount?: number;

    /** Indicates if the current authenticated user has liked this article */
    isLiked?: boolean;

    /** Indicates if the current authenticated user has bookmarked this article */
    isBookmarked?: boolean;
}
