/**
 * @module ArticleCommentRoutes
 * Comment routes scoped to an article.
 *
 * There are only two: creating a comment and listing the top level. Replies,
 * comment detail, likes, bookmarks and deletion all continue to work through
 * the existing /comments/:commentId routes, because article comments live in
 * the same table as post comments.
 */

import type { FastifyInstance } from "fastify";
import { RateLimitPolicies } from "@plugins/rate-limit.plugin";
import {
    articleCommentParamsSchema,
    createArticleCommentBodySchema,
    CreateArticleCommentResponseSchema,
    getArticleCommentsQuerySchema,
    GetArticleCommentsResponseSchema,
    type ArticleCommentParams,
    type CreateArticleCommentBody,
    type CreateArticleCommentResponse,
    type GetArticleCommentsQuery,
    type GetArticleCommentsResponse,
} from "@typings/schemas/article/article-comment.schema";

/**
 * Registers the article comment endpoints.
 *
 * @param fastify - The Fastify application instance
 */
export function articleCommentRoutes(fastify: FastifyInstance): void {
    const { commentController } = fastify.diContainer.cradle;

    fastify.post<{
        Params: ArticleCommentParams;
        Body: CreateArticleCommentBody;
        Reply: { 201: CreateArticleCommentResponse };
    }>(
        "/articles/:articleId/comments",
        {
            onRequest: [fastify.authenticate],
            schema: {
                params: articleCommentParamsSchema,
                body: createArticleCommentBodySchema,
                response: { 201: CreateArticleCommentResponseSchema },
                tags: ["Article", "Comment"],
            },
            config: { rateLimit: RateLimitPolicies.STANDARD },
        },
        commentController.createForArticle.bind(commentController),
    );

    fastify.get<{
        Params: ArticleCommentParams;
        Querystring: GetArticleCommentsQuery;
        Reply: { 200: GetArticleCommentsResponse };
    }>(
        "/articles/:articleId/comments",
        {
            onRequest: [fastify.optionalAuthenticate],
            schema: {
                params: articleCommentParamsSchema,
                querystring: getArticleCommentsQuerySchema,
                response: { 200: GetArticleCommentsResponseSchema },
                tags: ["Article", "Comment"],
            },
            config: { rateLimit: RateLimitPolicies.PUBLIC },
        },
        commentController.getArticleComments.bind(commentController),
    );
}
