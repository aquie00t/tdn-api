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
import {
    getArticlesQuerySchema,
    GetArticlesResponseSchema,
    type GetArticlesQuery,
    type GetArticlesResponse,
} from "@typings/schemas/article/get-articles.schema";
import {
    getArticleParamsSchema,
    type GetArticleParams,
} from "@typings/schemas/article/get-article.schema";
import {
    getMyArticlesQuerySchema,
    type GetMyArticlesQuery,
} from "@typings/schemas/article/get-my-articles.schema";
import { UploadCoverResponseSchema } from "@typings/schemas/article/upload-cover.schema";

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

    // Read routes are declared first for readability only: find-my-way scores
    // the static "me" segment above the ":slug" parameter regardless of order.
    fastify.get<{
        Querystring: GetArticlesQuery;
        Reply: { 200: GetArticlesResponse };
    }>(
        "/articles",
        {
            onRequest: [fastify.optionalAuthenticate],
            schema: {
                querystring: getArticlesQuerySchema,
                response: { 200: GetArticlesResponseSchema },
                tags: ["Article"],
            },
            config: { rateLimit: RateLimitPolicies.PUBLIC },
        },
        articleController.list.bind(articleController),
    );

    fastify.get<{
        Querystring: GetMyArticlesQuery;
        Reply: { 200: GetArticlesResponse };
    }>(
        "/articles/me",
        {
            onRequest: [fastify.authenticate],
            schema: {
                querystring: getMyArticlesQuerySchema,
                response: { 200: GetArticlesResponseSchema },
                tags: ["Article"],
            },
            config: { rateLimit: RateLimitPolicies.STANDARD },
        },
        articleController.mine.bind(articleController),
    );

    fastify.get<{
        Params: GetArticleParams;
        Reply: { 200: ArticleResponse };
    }>(
        "/articles/:slug",
        {
            onRequest: [fastify.optionalAuthenticate],
            schema: {
                params: getArticleParamsSchema,
                response: { 200: ArticleResponseSchema },
                tags: ["Article"],
            },
            config: { rateLimit: RateLimitPolicies.PUBLIC },
        },
        articleController.detail.bind(articleController),
    );

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

    // No body schema: declaring one would make Fastify try to validate a
    // multipart stream. The file is validated by its bytes in the use case.
    fastify.post(
        "/articles/cover",
        {
            onRequest: [fastify.authenticate],
            schema: {
                response: { 200: UploadCoverResponseSchema },
                tags: ["Article"],
            },
            config: { rateLimit: RateLimitPolicies.SENSITIVE },
        },
        articleController.uploadCover.bind(articleController),
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
