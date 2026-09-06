/**
 * @module CommentRoutes
 * @author TDN Team
 * @version 1.0.0
 */

import { RateLimitPolicies } from "@plugins/rate-limit.plugin";
import {
    createCommentBodySchema,
    createCommentParamsSchema,
    type CreateCommentBody,
    type CreateCommentParams,
    CreateCommentResponseSchema,
    type CreateCommentResponse,
} from "@typings/schemas/comment/create-comment.schema";
import {
    type DeleteCommentParams,
    deleteCommentParamsSchema,
} from "@typings/schemas/comment/delete-comment.schema";
import {
    type GetPostCommentsParams,
    getPostCommentsParamsSchema,
    type GetPostCommentsQuery,
    getPostCommentsQuerySchema,
    GetPostCommentsResponseSchema,
    type GetPostCommentsResponse,
} from "@typings/schemas/comment/get-post-comments.schema";
import {
    type CommentActionParams,
    commentActionParamsSchema,
    CommentActionResponseSchema,
    type CommentActionResponse,
} from "@typings/schemas/comment/like-comment.schema";
import {
    type GetCommentParams,
    getCommentParamsSchema,
    GetCommentResponseSchema,
    type GetCommentResponse,
} from "@typings/schemas/comment/get-comment.schema";
import {
    type GetCommentRepliesParams,
    type GetCommentRepliesQuery,
    getCommentRepliesParamsSchema,
    getCommentRepliesQuerySchema,
    GetCommentRepliesResponseSchema,
    type GetCommentRepliesResponse,
} from "@typings/schemas/comment/get-comment-replies.schema";
import { type FastifyInstance } from "fastify";

export function commentRoutes(fastify: FastifyInstance): void {
    const { commentController } = fastify.diContainer.cradle;

    fastify.post<{
        Params: CreateCommentParams;
        Body: CreateCommentBody;
        Reply: { 201: CreateCommentResponse };
    }>(
        "/posts/:postId/comments",
        {
            onRequest: [fastify.authenticate],
            schema: {
                params: createCommentParamsSchema,
                body: createCommentBodySchema,
                response: { 201: CreateCommentResponseSchema },
                tags: ["Comment"],
            },
            config: {
                idempotency: true,
                rateLimit: RateLimitPolicies.STANDARD,
            },
        },
        commentController.create.bind(commentController),
    );

    fastify.get<{
        Params: GetPostCommentsParams;
        Querystring: GetPostCommentsQuery;
        Reply: { 200: GetPostCommentsResponse };
    }>(
        "/posts/:postId/comments",
        {
            onRequest: [fastify.optionalAuthenticate],
            schema: {
                params: getPostCommentsParamsSchema,
                querystring: getPostCommentsQuerySchema,
                response: { 200: GetPostCommentsResponseSchema },
                tags: ["Post", "Comment"],
            },

            config: { rateLimit: RateLimitPolicies.PUBLIC },
        },
        commentController.getPostComments.bind(commentController),
    );

    fastify.delete<{ Params: DeleteCommentParams; Reply: { 204: void } }>(
        "/comments/:commentId",
        {
            onRequest: [fastify.authenticate],
            schema: {
                params: deleteCommentParamsSchema,
                tags: ["Comment"],
            },
            config: { rateLimit: RateLimitPolicies.STANDARD },
        },
        commentController.delete.bind(commentController),
    );

    fastify.post<{
        Params: CommentActionParams;
        Reply: { 200: CommentActionResponse };
    }>(
        "/comments/:commentId/like",
        {
            onRequest: [fastify.authenticate],
            schema: {
                params: commentActionParamsSchema,
                response: { 200: CommentActionResponseSchema },
                tags: ["Comment", "Interaction"],
            },

            config: { rateLimit: RateLimitPolicies.STANDARD },
        },
        commentController.likeComment.bind(commentController),
    );

    fastify.delete<{
        Params: CommentActionParams;
        Reply: { 200: CommentActionResponse };
    }>(
        "/comments/:commentId/unlike",
        {
            onRequest: [fastify.authenticate],
            schema: {
                params: commentActionParamsSchema,
                response: { 200: CommentActionResponseSchema },
                tags: ["Comment", "Interaction"],
            },
            config: { rateLimit: RateLimitPolicies.STANDARD },
        },
        commentController.unlikeComment.bind(commentController),
    );

    fastify.post<{
        Params: CommentActionParams;
        Reply: { 201: CommentActionResponse };
    }>(
        "/comments/:commentId/save",
        {
            onRequest: [fastify.authenticate],
            schema: {
                params: commentActionParamsSchema,
                response: { 201: CommentActionResponseSchema },
                tags: ["Comment", "Bookmark"],
            },
            config: { rateLimit: RateLimitPolicies.SENSITIVE },
        },
        fastify.diContainer.cradle.bookmarkController.saveComment.bind(
            fastify.diContainer.cradle.bookmarkController,
        ),
    );

    fastify.delete<{
        Params: CommentActionParams;
        Reply: { 200: CommentActionResponse };
    }>(
        "/comments/:commentId/unsave",
        {
            onRequest: [fastify.authenticate],
            schema: {
                params: commentActionParamsSchema,
                response: { 200: CommentActionResponseSchema },
                tags: ["Comment", "Bookmark"],
            },
            config: { rateLimit: RateLimitPolicies.SENSITIVE },
        },
        fastify.diContainer.cradle.bookmarkController.removeComment.bind(
            fastify.diContainer.cradle.bookmarkController,
        ),
    );

    fastify.get<{
        Params: GetCommentParams;
        Reply: { 200: GetCommentResponse };
    }>(
        "/comments/:commentId",
        {
            onRequest: [fastify.optionalAuthenticate],
            schema: {
                params: getCommentParamsSchema,
                response: { 200: GetCommentResponseSchema },
                tags: ["Comment"],
            },
            config: { rateLimit: RateLimitPolicies.PUBLIC },
        },
        commentController.getComment.bind(commentController),
    );

    fastify.get<{
        Params: GetCommentRepliesParams;
        Querystring: GetCommentRepliesQuery;
        Reply: { 200: GetCommentRepliesResponse };
    }>(
        "/comments/:commentId/replies",
        {
            onRequest: [fastify.optionalAuthenticate],
            schema: {
                params: getCommentRepliesParamsSchema,
                querystring: getCommentRepliesQuerySchema,
                response: { 200: GetCommentRepliesResponseSchema },
                tags: ["Comment"],
            },
            config: { rateLimit: RateLimitPolicies.PUBLIC },
        },
        commentController.getCommentReplies.bind(commentController),
    );
}
