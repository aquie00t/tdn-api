import type { PostCategory } from "@core/domain/enums/post-category-enum";
import type { PostType } from "@core/domain/enums/post-type.enum";

/**
 * Input interface for creating a new post.
 *
 * This interface defines the required parameters for creating a post
 * with optional media attachments.
 */
export interface CreatePostInput {
    /**
     * The unique identifier of the user creating the post.
     */
    authorId: string;

    /**
     * The textual content of the post.
     * Can be empty for media-only posts.
     */
    content: string;

    /**
     * The type of the post (e.g., text, image, video).
     */
    type: PostType;

    /**
     * Optional array of media URLs associated with the post.
     * These URLs should point to uploaded media files.
     */
    mediaUrls?: string[];
    /**
     * Array of categories associated with the post for classification and discovery.
     */
    categories?: PostCategory[];

    /**
     * Optional id of the post this one quotes.
     *
     * When set, the created post embeds that post as a quote card. Quoting a
     * quote is allowed; only the read side stops at one level.
     */
    quotedPostId?: string;
}
