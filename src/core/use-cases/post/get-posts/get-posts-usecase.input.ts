import type { PostType } from "@core/domain/enums/post-type.enum";
import type { PostCategory } from "@core/domain/enums/post-category-enum";

/**
 * Input interface for retrieving posts with pagination and filtering.
 *
 * This interface defines the optional parameters for fetching posts
 * with pagination support and type filtering.
 */
export interface GetPostsInput {
    /**
     * The page number for pagination (1-based).
     * Defaults to 1 if not provided.
     *
     * @deprecated Superseded by `cursor`, which is ignored when a usable
     * cursor is present. Page numbers are computed against whatever ranked
     * order exists at request time, so a feed that is being written to shifts
     * underneath them.
     */
    page?: number;

    /**
     * An opaque cursor from a previous response's `nextCursor`.
     *
     * Pins the request to the ranked order the reader started on. A cursor
     * that no longer resolves is not an error: the feed rebuilds and serves
     * the same depth in the new order.
     */
    cursor?: string;

    /**
     * The number of posts to retrieve per page.
     * Defaults to 10 if not provided.
     */
    limit?: number;

    /**
     * The type of posts to filter by.
     * If not provided, all post types will be returned.
     */
    type?: PostType;
    /**
     *
     */
    currentUserId?: string;
    tag?: string;
    followedOnly?: boolean;
    /** Optional array of categories to filter the feed */
    categories?: PostCategory[];

    /**
     * The request's raw `Accept-Language` header, when it carried one.
     *
     * Used only as a fallback: it decides the feed's language for a visitor
     * who is not signed in, and for a signed-in user who never chose one.
     */
    acceptLanguage?: string;
}
