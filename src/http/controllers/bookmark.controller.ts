/**
 * Controller for handling bookmark-related HTTP requests
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import type { CreateBookmarkUseCase } from "@core/use-cases/bookmark/create-bookmark/create-bookmark.usecase";
import type { RemoveBookmarkUseCase } from "@core/use-cases/bookmark/remove-bookmark/remove-bookmark.usecase";
import type { SaveBookmarkParams } from "@typings/schemas/bookmark/save-bookmark-params.schema";
import type { DeleteBookmarkParams } from "@typings/schemas/bookmark/delete-bookmark.params.schema";
import type { GetBookmarksQuery } from "@typings/schemas/bookmark/get-bookmarks-query.schema";
import type { GetBookmarksUseCase } from "@core/use-cases/bookmark/get-bookmarks/get-bookmarks.usecase";
import type { SaveCommentBookmarkUseCase } from "@core/use-cases/bookmark/save-comment-bookmark/save-comment-bookmark.usecase";
import type { RemoveCommentBookmarkUseCase } from "@core/use-cases/bookmark/remove-comment-bookmark/remove-comment-bookmark.usecase";
import type { CommentActionParams } from "@typings/schemas/comment/like-comment.schema";
import { PostPrismaMapper } from "@infrastructure/persistence/mappers/post-prisma.mapper";
import { CommentPrismaMapper } from "@infrastructure/persistence/mappers/comment-prisma.mapper";
import { ArticlePrismaMapper } from "@infrastructure/persistence/mappers/article-prisma.mapper";

export class BookmarkController {
    constructor(
        private readonly createBookmarkUseCase: CreateBookmarkUseCase,
        private readonly removeBookmarkUseCase: RemoveBookmarkUseCase,
        private readonly getBookmarksUseCase: GetBookmarksUseCase,
        private readonly saveCommentBookmarkUseCase: SaveCommentBookmarkUseCase,
        private readonly removeCommentBookmarkUseCase: RemoveCommentBookmarkUseCase,
    ) {}

    async save(
        request: FastifyRequest<{ Params: SaveBookmarkParams }>,
        reply: FastifyReply,
    ): Promise<void> {
        const userId = request.user.id;
        const postId = request.params.id;

        await this.createBookmarkUseCase.execute({ postId, userId });

        return reply.status(201).send({
            meta: { timestamp: new Date().toISOString() },
        });
    }

    async unsave(
        request: FastifyRequest<{ Params: DeleteBookmarkParams }>,
        reply: FastifyReply,
    ): Promise<void> {
        const userId = request.user.id;
        const postId = request.params.id;

        await this.removeBookmarkUseCase.execute({ postId, userId });

        return reply.status(200).send({
            meta: { timestamp: new Date().toISOString() },
        });
    }

    async saveComment(
        request: FastifyRequest<{ Params: CommentActionParams }>,
        reply: FastifyReply,
    ): Promise<void> {
        const userId = request.user.id;
        const commentId = request.params.commentId;

        await this.saveCommentBookmarkUseCase.execute({ commentId, userId });

        return reply.status(201).send({
            meta: { timestamp: new Date().toISOString() },
        });
    }

    async removeComment(
        request: FastifyRequest<{ Params: CommentActionParams }>,
        reply: FastifyReply,
    ): Promise<void> {
        const userId = request.user.id;
        const commentId = request.params.commentId;

        await this.removeCommentBookmarkUseCase.execute({ commentId, userId });

        return reply.status(200).send({
            meta: { timestamp: new Date().toISOString() },
        });
    }

    async getBookmarks(
        request: FastifyRequest<{ Querystring: GetBookmarksQuery }>,
        reply: FastifyReply,
    ): Promise<void> {
        const userId = request.user.id;
        const { page, limit } = request.query;

        const cdnUrl = request.server.config.R2_PUBLIC_URL;

        const result = await this.getBookmarksUseCase.execute({
            userId,
            page: page ?? 1,
            limit: limit ?? 10,
        });

        const posts = PostPrismaMapper.toFeedResponse(
            result.posts,
            cdnUrl,
            userId,
        );
        const comments = CommentPrismaMapper.toListResponse(
            result.comments,
            cdnUrl,
            userId,
        );
        const articles = ArticlePrismaMapper.toListResponse(
            result.articles,
            cdnUrl,
            userId,
        );

        return reply.status(200).send({
            data: { posts, comments, articles },
            meta: {
                postTotal: result.postTotal,
                commentTotal: result.commentTotal,
                articleTotal: result.articleTotal,
                page: page ?? 1,
                timestamp: new Date().toISOString(),
            },
        });
    }
}
