/**
 * @module ArticleInteractionRoutes
 * Like and bookmark routes for articles.
 */

import type { FastifyInstance } from "fastify";
import { RateLimitPolicies } from "@plugins/rate-limit.plugin";
import { MetaOnlyResponseSchema } from "@typings/schemas/create-response-schema";
import {
    articleIdParamsSchema,
    type ArticleIdParams,
} from "@typings/schemas/article/article-params.schema";

/**
 * Registers the article like and bookmark endpoints.
 *
 * All four are idempotent, so a retried request cannot double-count.
 *
 * @param fastify - The Fastify application instance
 */
export function articleInteractionRoutes(fastify: FastifyInstance): void {
    const { articleController } = fastify.diContainer.cradle;

    const options = {
        onRequest: [fastify.authenticate],
        schema: {
            params: articleIdParamsSchema,
            response: { 200: MetaOnlyResponseSchema },
            tags: ["Article", "Interaction"],
        },
        config: { rateLimit: RateLimitPolicies.STANDARD },
    };

    fastify.post<{ Params: ArticleIdParams }>(
        "/articles/:id/like",
        options,
        articleController.like.bind(articleController),
    );

    fastify.delete<{ Params: ArticleIdParams }>(
        "/articles/:id/like",
        options,
        articleController.unlike.bind(articleController),
    );

    fastify.post<{ Params: ArticleIdParams }>(
        "/articles/:id/bookmark",
        options,
        articleController.bookmark.bind(articleController),
    );

    fastify.delete<{ Params: ArticleIdParams }>(
        "/articles/:id/bookmark",
        options,
        articleController.removeBookmark.bind(articleController),
    );
}
