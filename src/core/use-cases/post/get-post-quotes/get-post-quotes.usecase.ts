import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { Post } from "@core/domain/entities/post.entity";
import { NotFoundError } from "@core/errors";
import type { GetPostQuotesInput } from "./get-post-quotes-usecase.input";

/**
 * Use case for listing the posts that quote a given post.
 *
 * This is what the quote count on a post leads to: a paginated, newest-first
 * page of the quotes behind that number.
 */
export class GetPostQuotesUseCase {
    /**
     * @param postRepository - Repository for reading posts.
     */
    constructor(private readonly postRepository: IPostRepository) {}

    /**
     * Retrieves one page of the quotes of a post.
     *
     * @param input - The post, the page to read, and the optional caller
     * @returns The page of quotes and the total number of them
     *
     * @throws NotFoundError - When the post itself does not exist
     *
     * @remarks
     * The post is resolved first so that "this post has no quotes" and "there
     * is no such post" stay different answers, the way `GET /posts/:id`
     * already distinguishes them. An empty page is a perfectly good result.
     */
    async execute(
        input: GetPostQuotesInput,
    ): Promise<{ posts: Post[]; total: number }> {
        const post = await this.postRepository.findById(input.postId);

        if (!post) {
            throw new NotFoundError("Post not found");
        }

        return await this.postRepository.findAll({
            page: input.page,
            limit: input.limit,
            quotedPostId: input.postId,
            currentUserId: input.currentUserId,
        });
    }
}
