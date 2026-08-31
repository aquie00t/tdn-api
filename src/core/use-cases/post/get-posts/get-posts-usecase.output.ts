import type { Post } from "@core/domain/entities/post.entity";

/**
 * Output interface for retrieving posts.
 *
 * This interface defines the structure of the data returned when fetching
 * posts with pagination support.
 */
export interface GetPostsOutput {
    /**
     * Array of post entities matching the query criteria.
     */
    posts: Post[];

    /**
     * Total number of posts matching the query criteria.
     */
    total: number;

    /**
     * The cursor that continues from where this page ended.
     *
     * Null when the feed has no more to give, and on feeds that are served
     * chronologically and therefore have nothing to pin.
     */
    nextCursor: string | null;
}
