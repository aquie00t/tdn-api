import type { PostType } from "@core/domain/enums/post-type.enum";
import type { Post } from "@core/domain/entities/post.entity";
import type { PostCategory } from "@core/domain/enums/post-category-enum";

/**
 * Parameters for paginated post retrieval with optional filtering.
 */
export interface GetPostsParams {
    page: number;
    limit: number;
    type?: PostType;
    authorId?: string;
    savedByUserId?: string;
    currentUserId?: string;
    tag?: string;
    followingIds?: string[];
    categories?: PostCategory[];
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
    ): Promise<{ posts: Post[]; total: number }>;

    /**
     * Counts total posts by a specific user.
     * @param userId - The ID of the user whose posts are being counted.
     * @returns The total number of posts by the user.
     */
    countByUserId(userId: string): Promise<number>;
}
