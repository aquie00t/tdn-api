/**
 * Controller for handling comment-related HTTP requests
 * Manages creation of comments and nested comments
 */
import type { CreateCommentUseCase } from "@core/use-cases/comment/create-comment/create-comment.usecase";
import type { DeleteCommentUseCase } from "@core/use-cases/comment/delete-comment/delete-comment.usecase";
import type { GetCommentsUseCase } from "@core/use-cases/comment/get-comments/get-comments.usecase";
import type { GetCommentUseCase } from "@core/use-cases/comment/get-comment/get-comment.usecase";
import type { GetCommentRepliesUseCase } from "@core/use-cases/comment/get-comment-replies/get-comment-replies.usecase";
import type { LikeCommentUseCase } from "@core/use-cases/comment/like-comment/like-comment.usecase";
import type { UnlikeCommentUseCase } from "@core/use-cases/comment/unlike-comment/unlike-comment.usecase";
import { CommentPrismaMapper } from "@infrastructure/persistence/mappers/comment-prisma.mapper";
import type {
    ArticleCommentParams,
    CreateArticleCommentBody,
    GetArticleCommentsQuery,
} from "@typings/schemas/article/article-comment.schema";
import type {
    CreateCommentBody,
    CreateCommentParams,
} from "@typings/schemas/comment/create-comment.schema";
import type { DeleteCommentParams } from "@typings/schemas/comment/delete-comment.schema";
import type {
    GetPostCommentsQuery,
    GetPostCommentsParams,
} from "@typings/schemas/comment/get-post-comments.schema";
import type { GetCommentParams } from "@typings/schemas/comment/get-comment.schema";
import type {
    GetCommentRepliesParams,
    GetCommentRepliesQuery,
} from "@typings/schemas/comment/get-comment-replies.schema";
import type { CommentActionParams } from "@typings/schemas/comment/like-comment.schema";
import type { FastifyRequest, FastifyReply } from "fastify";

export class CommentController {
    constructor(
        private readonly createCommentUseCase: CreateCommentUseCase,
        private readonly deleteCommentUseCase: DeleteCommentUseCase,
        private readonly getCommentsUseCase: GetCommentsUseCase,
        private readonly getCommentUseCase: GetCommentUseCase,
        private readonly getCommentRepliesUseCase: GetCommentRepliesUseCase,
        private readonly likeCommentUseCase: LikeCommentUseCase,
        private readonly unlikeCommentUseCase: UnlikeCommentUseCase,
    ) {}

    async create(
        request: FastifyRequest<{
            Params: CreateCommentParams;
            Body: CreateCommentBody;
        }>,
        reply: FastifyReply,
    ): Promise<void> {
        const userId = request.user.id;
        const { postId } = request.params;
        const { content, parentId, mediaUrls } = request.body;

        const comment = await this.createCommentUseCase.execute({
            content,
            target: { type: "POST", id: postId },
            authorId: userId,
            parentId,
            mediaUrls,
        });

        return reply.status(201).send({
            data: CommentPrismaMapper.toResponse(
                comment,
                request.server.config.R2_PUBLIC_URL,
                userId,
            ),
            meta: { timestamp: new Date().toISOString() },
        });
    }

    /**
     * Creates a comment on an article.
     *
     * Shares the comment use case with posts; only the target differs, which
     * is why replies, likes, bookmarks and deletion all keep working through
     * the existing /comments/:commentId routes.
     *
     * @param request - Request carrying the article id and the comment body
     * @param reply - The Fastify reply object
     * @returns A 201 response containing the created comment
     */
    async createForArticle(
        request: FastifyRequest<{
            Params: ArticleCommentParams;
            Body: CreateArticleCommentBody;
        }>,
        reply: FastifyReply,
    ): Promise<void> {
        const userId = request.user.id;
        const { articleId } = request.params;
        const { content, parentId, mediaUrls } = request.body;

        const comment = await this.createCommentUseCase.execute({
            content,
            target: { type: "ARTICLE", id: articleId },
            authorId: userId,
            parentId,
            mediaUrls,
        });

        return reply.status(201).send({
            data: CommentPrismaMapper.toResponse(
                comment,
                request.server.config.R2_PUBLIC_URL,
                userId,
            ),
            meta: { timestamp: new Date().toISOString() },
        });
    }

    /**
     * Lists the top-level comments of an article.
     *
     * @param request - Request carrying the article id and pagination
     * @param reply - The Fastify reply object
     * @returns A 200 response containing the page of comments
     */
    async getArticleComments(
        request: FastifyRequest<{
            Params: ArticleCommentParams;
            Querystring: GetArticleCommentsQuery;
        }>,
        reply: FastifyReply,
    ): Promise<void> {
        const { articleId } = request.params;
        const { page = 1, limit = 10 } = request.query;
        const currentUserId = request.user?.id;

        const comments = await this.getCommentsUseCase.execute({
            target: { type: "ARTICLE", id: articleId },
            page,
            limit,
            currentUserId,
        });

        return reply.status(200).send({
            data: CommentPrismaMapper.toListResponse(
                comments,
                request.server.config.R2_PUBLIC_URL,
                currentUserId,
            ),
            meta: { currentPage: page, limit },
        });
    }

    async delete(
        request: FastifyRequest<{ Params: DeleteCommentParams }>,
        reply: FastifyReply,
    ): Promise<void> {
        const { commentId } = request.params;
        const userId = request.user.id;

        await this.deleteCommentUseCase.execute({
            commentId,
            userId,
        });

        return reply.status(204).send();
    }

    async getPostComments(
        request: FastifyRequest<{
            Params: GetPostCommentsParams;
            Querystring: GetPostCommentsQuery;
        }>,
        reply: FastifyReply,
    ): Promise<void> {
        const { postId } = request.params;
        const { page = 1, limit = 10 } = request.query;

        const currentUserId = request.user?.id;
        const cdnUrl = request.server.config.R2_PUBLIC_URL;

        const comments = await this.getCommentsUseCase.execute({
            target: { type: "POST", id: postId },
            page,
            limit,
            currentUserId,
        });

        const formattedData = CommentPrismaMapper.toListResponse(
            comments,
            cdnUrl,
            currentUserId,
        );

        return reply.status(200).send({
            data: formattedData,
            meta: {
                currentPage: page,
                limit,
            },
        });
    }

    async likeComment(
        request: FastifyRequest<{ Params: CommentActionParams }>,
        reply: FastifyReply,
    ): Promise<void> {
        const { commentId } = request.params;
        const userId = request.user!.id;

        await this.likeCommentUseCase.execute({ commentId, userId });

        return reply.status(200).send({
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    }

    async unlikeComment(
        request: FastifyRequest<{ Params: CommentActionParams }>,
        reply: FastifyReply,
    ): Promise<void> {
        const { commentId } = request.params;
        const userId = request.user!.id;

        await this.unlikeCommentUseCase.execute({ commentId, userId });

        return reply.status(200).send({
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    }

    async getComment(
        request: FastifyRequest<{ Params: GetCommentParams }>,
        reply: FastifyReply,
    ): Promise<void> {
        const { commentId } = request.params;
        const currentUserId = request.user?.id;
        const cdnUrl = request.server.config.R2_PUBLIC_URL;

        const comment = await this.getCommentUseCase.execute({
            commentId,
            currentUserId,
        });

        return reply.status(200).send({
            data: CommentPrismaMapper.toResponse(
                comment,
                cdnUrl,
                currentUserId,
            ),
            meta: { timestamp: new Date().toISOString() },
        });
    }

    async getCommentReplies(
        request: FastifyRequest<{
            Params: GetCommentRepliesParams;
            Querystring: GetCommentRepliesQuery;
        }>,
        reply: FastifyReply,
    ): Promise<void> {
        const { commentId } = request.params;
        const { page = 1, limit = 10 } = request.query;
        const currentUserId = request.user?.id;
        const cdnUrl = request.server.config.R2_PUBLIC_URL;

        const replies = await this.getCommentRepliesUseCase.execute({
            commentId,
            page,
            limit,
            currentUserId,
        });

        return reply.status(200).send({
            data: CommentPrismaMapper.toListResponse(
                replies,
                cdnUrl,
                currentUserId,
            ),
            meta: {
                currentPage: page,
                limit,
            },
        });
    }
}
