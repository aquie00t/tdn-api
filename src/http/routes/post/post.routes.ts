/**
 * @module PostRoutes
 * Post routes including create, delete, get feed and upload media.
 * @author TDN Team
 * @version 1.0.0
 */

import { RateLimitPolicies } from "@plugins/rate-limit.plugin";
import {
    type CreatePostBody,
    createPostBodySchema,
    CreatePostResponseSchema,
    type CreatePostResponse,
} from "@typings/schemas/post/create-post.schema";
import {
    type DeletePostParams,
    deletePostParamsSchema,
} from "@typings/schemas/post/delete-post.schema";
import {
    type GetPostParams,
    getPostParamsSchema,
    GetPostResponseSchema,
    type GetPostResponse,
} from "@typings/schemas/post/get-post.schema";
import {
    getPostQuotesParamsSchema,
    getPostQuotesQuerySchema,
    GetPostQuotesResponseSchema,
    type GetPostQuotesParams,
    type GetPostQuotesQuery,
    type GetPostQuotesResponse,
} from "@typings/schemas/post/get-post-quotes.schema";
import {
    getPostsQuerySchema,
    type GetPostsQuery,
    GetFeedResponseSchema,
    type GetFeedResponse,
} from "@typings/schemas/post/get-posts.schema";
import { Type as FBType } from "@fastify/type-provider-typebox";
import { ResponseSchema } from "@typings/schemas/create-response-schema";
import type { FastifyInstance } from "fastify";

const UploadMediaResponseSchema = ResponseSchema(
    FBType.Object({ mediaUrls: FBType.Array(FBType.String()) }),
);

/**
 * Sets up post routes on the Fastify instance
 *
 * Registers all post-related HTTP endpoints including:
 * - POST / - Create a new post
 * - POST /media - Upload media files for posts
 * - GET / - Retrieve paginated post feed
 * - DELETE /:id - Delete a post by ID
 * - POST /:id/like - Like a post by ID
 *
 * @param fastify - The Fastify application instance
 * @returns void
 */
export function postRoutes(fastify: FastifyInstance): void {
    const { postController } = fastify.diContainer.cradle;

    /**
     * Create a new post
     * Requires authentication and applies sensitive rate limiting
     */
    fastify.post<{ Body: CreatePostBody; Reply: { 201: CreatePostResponse } }>(
        "/posts",
        {
            onRequest: [fastify.authenticate],
            schema: {
                body: createPostBodySchema,
                response: { 201: CreatePostResponseSchema },
                tags: ["Post"],
            },
            config: {
                idempotency: true,
                rateLimit: RateLimitPolicies.SENSITIVE,
            },
        },
        postController.create.bind(postController),
    );

    /**
     * Upload media files for a post
     * Requires authentication and applies sensitive rate limiting
     */
    fastify.post(
        "/media",
        {
            onRequest: [fastify.authenticate],
            config: {
                idempotency: true,
                rateLimit: RateLimitPolicies.SENSITIVE,
            },
            schema: {
                response: { 200: UploadMediaResponseSchema },
                tags: ["Post"],
            },
        },
        postController.uploadMedia.bind(postController),
    );

    /**
     * Retrieve paginated post feed
     * Applies standard rate limiting
     */
    fastify.get<{
        Querystring: GetPostsQuery;
        Reply: { 200: GetFeedResponse };
    }>(
        "/posts",
        {
            schema: {
                querystring: getPostsQuerySchema,
                response: { 200: GetFeedResponseSchema },
                tags: ["Post"],
            },
            config: { rateLimit: RateLimitPolicies.STANDARD },
            onRequest: [fastify.optionalAuthenticate],
        },
        postController.getFeed.bind(postController),
    );

    /**
     * Delete a post by ID
     * Requires authentication and applies sensitive rate limiting
     */
    fastify.delete<{ Params: DeletePostParams }>(
        "/posts/:id",
        {
            onRequest: [fastify.authenticate],
            schema: {
                params: deletePostParamsSchema,
                tags: ["Post"],
            },
            config: { rateLimit: RateLimitPolicies.SENSITIVE },
        },
        postController.deletePost.bind(postController),
    );

    fastify.get<{ Params: GetPostParams; Reply: { 200: GetPostResponse } }>(
        "/posts/:id",
        {
            schema: {
                params: getPostParamsSchema,
                response: { 200: GetPostResponseSchema },
                tags: ["Post"],
            },
            config: { rateLimit: RateLimitPolicies.STANDARD },
            onRequest: [fastify.optionalAuthenticate],
        },
        postController.getPost.bind(postController),
    );

    /**
     * List the posts quoting a post
     * Applies standard rate limiting; optional auth fills in the caller's
     * like and bookmark state on each quote
     */
    fastify.get<{
        Params: GetPostQuotesParams;
        Querystring: GetPostQuotesQuery;
        Reply: { 200: GetPostQuotesResponse };
    }>(
        "/posts/:id/quotes",
        {
            schema: {
                params: getPostQuotesParamsSchema,
                querystring: getPostQuotesQuerySchema,
                response: { 200: GetPostQuotesResponseSchema },
                tags: ["Post"],
            },
            config: { rateLimit: RateLimitPolicies.STANDARD },
            onRequest: [fastify.optionalAuthenticate],
        },
        postController.getQuotes.bind(postController),
    );
}
