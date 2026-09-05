import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { Post } from "@core/domain/entities/post.entity";
import { NotFoundError } from "@core/errors";
import type { IBlockRepository } from "@core/ports/repositories/block.repository";
import type { GetPostDetailUseCaseInput } from "./get-post-detail-usecase.input";

/**
 * Use case for retrieving the details of a specific post. It takes a post ID and an optional user ID to determine if the user has access to the post. If the post is found, it returns the post details; otherwise, it throws a NotFoundError.
 */
export class GetPostDetailUseCase {
    /**
     * @param postRepository - An instance of IPostRepository to interact with the data layer for posts.
     * @param blockRepository - Repository used to hide a blocked author\'s post.
     */
    constructor(
        private readonly postRepository: IPostRepository,
        private readonly blockRepository: IBlockRepository,
    ) {}

    /**
     * Executes the use case to get the details of a post by its ID. If the post is not found, it throws a NotFoundError.
     * @param input - An object containing the input parameters for the use case.
     * @param input.postId - The ID of the post to retrieve.
     * @param input.userId - (Optional) The ID of the current user, used to determine access to the post.
     * @returns A promise that resolves to the post details if found, or rejects with a NotFoundError if not found.
     */
    async execute(input: GetPostDetailUseCaseInput): Promise<Post> {
        const { postId, userId } = input;
        const post = await this.postRepository.findById(postId, userId);

        if (!post) {
            throw new NotFoundError("Post not found");
        }

        // The same error a missing post gets. A distinct one would let anyone
        // check whether a particular account has blocked them by opening a
        // link, which the profile already answers deliberately and this
        // endpoint has no reason to answer twice.
        if (userId && post.author.id !== userId) {
            const blocked = await this.blockRepository.existsBetween(
                userId,
                post.author.id,
            );

            if (blocked) throw new NotFoundError("Post not found");
        }

        return post;
    }
}
