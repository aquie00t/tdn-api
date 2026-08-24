/**
 * @module ArticleRoutes
 * Article write routes: create, update, publish, archive and delete.
 */

import type { FastifyInstance } from "fastify";
import { RateLimitPolicies } from "@plugins/rate-limit.plugin";
import {
    ArticleResponseSchema,
    type ArticleResponse,
} from "@typings/schemas/article/article-item.schema";
import {
    articleIdParamsSchema,
    type ArticleIdParams,
} from "@typings/schemas/article/article-params.schema";
import {
    ARTICLE_BODY_LIMIT_BYTES,
    createArticleBodySchema,
    type CreateArticleBody,
} from "@typings/schemas/article/create-article.schema";
import {
    updateArticleBodySchema,
    type UpdateArticleBody,
} from "@typings/schemas/article/update-article.schema";

/**
 * Registers the article write endpoints.
 *
 * `bodyLimit` is set on the two routes that accept a markdown body so an
 * oversized payload is rejected before it is parsed, rather than after schema
 * validation has already walked a megabyte of JSON.
 *
 * @param fastify - The Fastify application instance
 */
export function articleRoutes(fastify: FastifyInstance): void {
    const { articleController } = fastify.diContainer.cradle;

    fastify.post<{ Body: CreateArticleBody; Reply: { 201: ArticleResponse } }>(
        "/articles",
        {
            onRequest: [fastify.authenticate],
            bodyLimit: ARTICLE_BODY_LIMIT_BYTES,
            schema: {
                body: createArticleBodySchema,
                response: { 201: ArticleResponseSchema },
                tags: ["Article"],
            },
            config: { rateLimit: RateLimitPolicies.SENSITIVE },
        },
        articleController.create.bind(articleController),
    );

    fastify.patch<{
        Params: ArticleIdParams;
        Body: UpdateArticleBody;
        Reply: { 200: ArticleResponse };
    }>(
        "/articles/:id",
        {
            onRequest: [fastify.authenticate],
            bodyLimit: ARTICLE_BODY_LIMIT_BYTES,
            schema: {
                params: articleIdParamsSchema,
                body: updateArticleBodySchema,
                response: { 200: ArticleResponseSchema },
                tags: ["Article"],
            },
            config: { rateLimit: RateLimitPolicies.STANDARD },
        },
        articleController.update.bind(articleController),
    );

    fastify.post<{ Params: ArticleIdParams; Reply: { 200: ArticleResponse } }>(
        "/articles/:id/publish",
        {
            onRequest: [fastify.authenticate],
            schema: {
                params: articleIdParamsSchema,
                response: { 200: ArticleResponseSchema },
                tags: ["Article"],
            },
            config: { rateLimit: RateLimitPolicies.SENSITIVE },
        },
        articleController.publish.bind(articleController),
    );

    fastify.post<{ Params: ArticleIdParams; Reply: { 200: ArticleResponse } }>(
        "/articles/:id/archive",
        {
            onRequest: [fastify.authenticate],
            schema: {
                params: articleIdParamsSchema,
                response: { 200: ArticleResponseSchema },
                tags: ["Article"],
            },
            config: { rateLimit: RateLimitPolicies.SENSITIVE },
        },
        articleController.archive.bind(articleController),
    );

    fastify.delete<{ Params: ArticleIdParams }>(
        "/articles/:id",
        {
            onRequest: [fastify.authenticate],
            schema: {
                params: articleIdParamsSchema,
                tags: ["Article"],
            },
            config: { rateLimit: RateLimitPolicies.SENSITIVE },
        },
        articleController.remove.bind(articleController),
    );
}
