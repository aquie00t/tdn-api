/**
 * Use case for retrieving a user's bookmarked posts, comments and articles
 */
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { ICommentBookmarkRepository } from "@core/ports/repositories/comment-bookmark.repository";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { GetBookmarksUseCaseInput } from "./get-bookmarks-usecase.input";
import type { Post } from "@core/domain/entities/post.entity";
import type { Comment } from "@core/domain/entities/comment.entity";
import type { Article } from "@core/domain/entities/article.entity";

export class GetBookmarksUseCase {
    /**
     * @param postRepository - Repository for accessing posts, used to retrieve bookmarked posts
     * @param commentBookmarkRepository - Repository for accessing comment bookmarks, used to retrieve bookmarked comments
     * @param articleRepository - Repository for accessing articles, used to retrieve bookmarked articles
     */
    constructor(
        private readonly postRepository: IPostRepository,
        private readonly commentBookmarkRepository: ICommentBookmarkRepository,
        private readonly articleRepository: IArticleRepository,
    ) {}
    /**
     * Executes the use case to retrieve a user's bookmarked posts, comments and
     * articles based on the provided input.
     *
     * Articles live in their own table rather than under `Post`, so a bookmarked
     * article is invisible to the post query and has to be fetched separately.
     *
     * @param input - The input containing the user ID and optional pagination parameters
     * @returns An object containing arrays of bookmarked posts, comments and articles, along with their respective total counts for pagination purposes
     */
    async execute(input: GetBookmarksUseCaseInput): Promise<{
        posts: Post[];
        postTotal: number;
        comments: Comment[];
        commentTotal: number;
        articles: Article[];
        articleTotal: number;
    }> {
        const page = input.page || 1;
        const limit = input.limit || 10;
        const offset = (page - 1) * limit;

        const [postResult, commentResult, articleResult] = await Promise.all([
            this.postRepository.findAll({
                page,
                limit,
                savedByUserId: input.userId,
                currentUserId: input.userId,
            }),
            this.commentBookmarkRepository.findBookmarkedByUserId(
                input.userId,
                limit,
                offset,
            ),
            this.articleRepository.findAll({
                page,
                limit,
                savedByUserId: input.userId,
                currentUserId: input.userId,
            }),
        ]);

        return {
            posts: postResult.posts,
            postTotal: postResult.total,
            comments: commentResult.comments,
            commentTotal: commentResult.total,
            articles: articleResult.articles,
            articleTotal: articleResult.total,
        };
    }
}
