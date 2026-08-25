import type { ICommentRepository } from "@core/ports/repositories/comment.repository";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import { NotFoundError } from "@core/errors";
import type { Comment } from "@core/domain/entities/comment.entity";
import type { GetCommentsUseCaseInput } from "./get-comments.input";

/**
 * Use case for listing the top-level comments of a post or an article.
 *
 * The target is checked before its comments are read, so a comment list cannot
 * be used to probe for content the caller could not otherwise see: an
 * unpublished article answers 404 here exactly as it does on its own endpoint.
 */
export class GetCommentsUseCase {
    /**
     * @param commentRepository - Repository for reading comments
     * @param postRepository - Repository used to verify a post target
     * @param articleRepository - Repository used to verify an article target
     */
    constructor(
        private readonly commentRepository: ICommentRepository,
        private readonly postRepository: IPostRepository,
        private readonly articleRepository: IArticleRepository,
    ) {}

    /**
     * Confirms the commented-on resource exists and may be seen.
     *
     * @param input - The request, carrying the target and the viewer
     * @throws NotFoundError - When the target is missing or not visible
     */
    private async assertTargetVisible(
        input: GetCommentsUseCaseInput,
    ): Promise<void> {
        if (input.target.type === "POST") {
            const post = await this.postRepository.findById(input.target.id);
            if (!post) {
                throw new NotFoundError(
                    "The post was either not found or has been deleted.",
                );
            }
            return;
        }

        const article = await this.articleRepository.findById(input.target.id);
        if (!article || !article.isVisibleTo(input.currentUserId)) {
            throw new NotFoundError("Article not found.");
        }
    }

    /**
     * Executes the listing.
     *
     * @param input - The target, pagination and the viewer
     * @returns The page of top-level comments
     * @throws NotFoundError if the target does not exist or is not visible
     */
    async execute(input: GetCommentsUseCaseInput): Promise<Comment[]> {
        const page = input.page || 1;
        const limit = input.limit || 10;
        const offset = (page - 1) * limit;

        await this.assertTargetVisible(input);

        return await this.commentRepository.findTopLevelByTarget(
            input.target,
            limit,
            offset,
            input.currentUserId,
        );
    }
}
