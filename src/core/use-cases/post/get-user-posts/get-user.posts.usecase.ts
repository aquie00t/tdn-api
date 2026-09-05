import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { IBlockRepository } from "@core/ports/repositories/block.repository";
import type { Post } from "@core/domain/entities/post.entity";
import type { GetUserPostsInput } from "@core/use-cases/post/get-user-posts/get-user-posts-usecase.input";

/**
 * Use case for retrieving a paginated list of posts authored by a specific user, with optional filtering by post type. This use case interacts with the IPostRepository to fetch the relevant posts based on the provided input parameters, which include the username of the author, pagination details, and optional filters for post type and current user interactions (likes/bookmarks). The result includes both the array of Post entities and the total count of posts matching the criteria, allowing for efficient pagination on the client side.
 */
export class GetUserPostsUseCase {
    /**
     * Constructs the GetUserPostsUseCase with the necessary repository dependency.
     * @param postRepository - An implementation of the IPostRepository interface for accessing post data from the persistence layer.
     * @param blockRepository - Repository used to resolve who the viewer cannot see.
     */
    constructor(
        private readonly postRepository: IPostRepository,
        private readonly blockRepository: IBlockRepository,
    ) {}

    /**
     * Executes the use case to retrieve a paginated list of posts by a specific user, with optional filtering by post type and consideration of the current user's interactions with the posts.
     * @param input - An object containing the username of the post author, pagination parameters (page and limit), optional post type filter, and optional current user ID for determining likes/bookmarks.
     * @return A promise that resolves to an object containing the array of Post entities and the total count of posts matching the criteria.
     */
    async execute(
        input: GetUserPostsInput,
    ): Promise<{ posts: Post[]; total: number }> {
        // A blocked author\'s timeline comes back empty rather than 404: the
        // profile above it still renders, and it is the one place that says
        // what happened.
        const excludeAuthorIds = input.currentUserId
            ? await this.blockRepository.getInvisibleUserIds(
                  input.currentUserId,
              )
            : [];

        return await this.postRepository.findByAuthorUsername(
            input.username,
            input.page,
            input.limit,
            input.type,
            input.currentUserId,
            excludeAuthorIds,
        );
    }
}
