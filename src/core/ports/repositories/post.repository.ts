import type { MediaState } from "@core/ports/repositories/media-asset.repository";
import type { PostType } from "@core/domain/enums/post-type.enum";
import type { Post } from "@core/domain/entities/post.entity";
import type { PostCategory } from "@core/domain/enums/post-category-enum";
import type { FeedCandidate } from "@core/domain/interfaces/feed-candidate.interface";

/**
 * Parameters for paginated post retrieval with optional filtering.
 */
export interface GetPostsParams {
    page: number;
    limit: number;

    /**
     * Rows to skip, overriding the offset derived from `page`.
     *
     * The ranked feed needs an offset that no page number expresses: its
     * chronological tail starts wherever the ranked window ended, which is
     * rarely a multiple of the page size.
     */
    skip?: number;
    type?: PostType;
    authorId?: string;
    savedByUserId?: string;
    currentUserId?: string;
    tag?: string;
    followingIds?: string[];
    categories?: PostCategory[];

    /** Restricts the page to the posts quoting this one. */
    quotedPostId?: string;

    /**
     * Posts to leave out of the page.
     *
     * Used by the feed's chronological tail to skip everything the ranked head
     * already served, so paging past the ranked window never repeats a post.
     */
    excludeIds?: string[];

    /**
     * Authors to leave out entirely - the accounts this viewer has blocked,
     * and those who blocked them.
     *
     * Separate from `excludeIds`, which names individual posts the caller has
     * already served. This one is about who wrote them, and it applies to
     * every read a viewer makes.
     */
    excludeAuthorIds?: string[];
}

/**
 * Filters for the pool the feed ranker scores.
 *
 * Mirrors the feed's own filters - a ranked feed still has to honour the type,
 * tag and category the caller asked for - but takes a time window and a hard
 * cap instead of a page, because the pool is ranked as a whole and only then
 * paginated.
 */
export interface CountPostsParams {
    type?: PostType;
    tag?: string;
    categories?: PostCategory[];
    followingIds?: string[];

    /**
     * Authors to leave out entirely - the accounts this viewer has blocked,
     * and those who blocked them.
     *
     * Separate from `excludeIds`, which names individual posts the caller has
     * already served. This one is about who wrote them, and it applies to
     * every read a viewer makes.
     */
    excludeAuthorIds?: string[];
}

export interface FeedCandidateParams {
    type?: PostType;
    tag?: string;
    categories?: PostCategory[];
    followingIds?: string[];

    /** Oldest post the pool may contain. */
    since: Date;

    /** Hard cap on the pool size. */
    limit: number;

    /**
     * Authors to leave out entirely - the accounts this viewer has blocked,
     * and those who blocked them.
     *
     * Separate from `excludeIds`, which names individual posts the caller has
     * already served. This one is about who wrote them, and it applies to
     * every read a viewer makes.
     */
    excludeAuthorIds?: string[];
}

/**
 * Repository interface for managing Post entities.
 * Following Clean Architecture principles, this interface defines the contract
 * for persisting and retrieving Post domain entities without exposing
 * implementation details or DTOs.
 */
export interface IPostRepository {
    /**
     * Creates a new post entity in the persistence layer.
     * @param post - The Post entity to be created.
     */
    create(post: Post): Promise<Post>;

    /**
     * Retrieves a paginated list of posts with optional type filtering.
     * @param params - Pagination and filtering parameters.
     * @returns An object containing the posts array and total count.
     */
    findAll(params: GetPostsParams): Promise<{ posts: Post[]; total: number }>;

    /**
     * Counts the posts matching a set of feed filters.
     *
     * Split out from {@link findAll} because the ranked feed needs the total
     * without a page: it pages through an order it built itself, and would
     * otherwise have to fetch rows purely to be told how many there are.
     *
     * @param params - The same filters findAll accepts, without pagination.
     * @returns The number of matching posts.
     */
    countAll(params: CountPostsParams): Promise<number>;

    /**
     * Retrieves the pool of recent posts the feed ranker scores.
     *
     * Returns a light projection rather than full entities: the pool is orders
     * of magnitude larger than the page that survives ranking, and hydrating
     * all of it would cost more than the ranking saves.
     *
     * @param params - Filters, time window and pool size.
     * @returns The candidates, newest first.
     */
    findFeedCandidates(params: FeedCandidateParams): Promise<FeedCandidate[]>;

    /**
     * Retrieves fully hydrated posts by their identifiers.
     *
     * Order is not guaranteed to follow `ids`; the caller re-imposes the order
     * it asked for. Ids that no longer exist are simply absent - a post
     * deleted between ranking and hydration must not fail the request.
     *
     * @param ids - The post identifiers to load.
     * @param currentUserId - Optional viewer, used to resolve isLiked/isBookmarked.
     * @param excludeAuthorIds - Authors to drop even though their ids were
     * asked for. The feed hydrates from a cached ranked order that may predate
     * a block, so applying the exclusion here is what lets a stale snapshot
     * heal itself instead of needing to be invalidated.
     * @returns The posts that still exist and the viewer may see.
     */
    findByIds(
        ids: string[],
        currentUserId?: string,
        excludeAuthorIds?: string[],
    ): Promise<Post[]>;

    /**
     * Retrieves a post by its unique identifier.
     * @param id - The unique identifier of the post.
     * @returns The Post entity if found, otherwise null.
     */
    findById(id: string, currentUserId?: string): Promise<Post | null>;

    /**
     * Deletes a post by its unique identifier.
     * @param id - The unique identifier of the post to be deleted.
     */
    delete(id: string): Promise<void>;

    /**
     * Increments the comment count for a post
     * @param postId - The ID of the post to increment comment count for
     */
    incrementCommentsCount(postId: string): Promise<void>;

    /**
     * Decrements the comment count for a post
     * @param postId - The ID of the post to decrement comment count for
     */
    decrementCommentsCount(postId: string): Promise<void>;

    /**
     * Increments the quote count for a post.
     * @param postId - The ID of the post that was quoted.
     */
    incrementQuoteCount(postId: string): Promise<void>;

    /**
     * Overwrites the media state written by moderation.
     *
     * Used by the background worker once a video has a verdict. The full media
     * list is passed rather than a diff: the surviving assets already describe
     * exactly what the content should carry, and computing a removal against a
     * row that may have changed underneath is how a race turns into a media
     * list that is missing something.
     *
     * @param id - The id of the content to update
     * @param state - The media list and moderation flags to store
     */
    updateMediaState(id: string, state: MediaState): Promise<void>;

    /**
     * Decrements the quote count for a post.
     * @param postId - The ID of the post whose quote was deleted.
     */
    decrementQuoteCount(postId: string): Promise<void>;
    /**
     * Finds posts by the author's username with pagination and optional type filtering.
     * @param username - The username of the author whose posts are being retrieved.
     * @param page - The page number for pagination.
     * @param limit - The number of posts to retrieve per page.
     * @param type - Optional filter to retrieve posts of a specific type.
     * @param currentUserId - Optional ID of the current user to determine if they have liked or bookmarked the posts.
     * @returns An object containing the array of Post entities and the total count of posts matching the criteria.
     */
    findByAuthorUsername(
        username: string,
        page: number,
        limit: number,
        type?: string,
        currentUserId?: string,
        excludeAuthorIds?: string[],
    ): Promise<{ posts: Post[]; total: number }>;

    /**
     * Counts total posts by a specific user.
     * @param userId - The ID of the user whose posts are being counted.
     * @returns The total number of posts by the user.
     */
    countByUserId(userId: string): Promise<number>;
}
