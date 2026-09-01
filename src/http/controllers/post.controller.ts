import { MediaLimitExceededError, NoMediaProvidedError } from "@core/errors";
import type { CreatePostUseCase } from "@core/use-cases/post/create-post";
import type { DeletePostUseCase } from "@core/use-cases/post/delete-post";
import type { GetPostDetailUseCase } from "@core/use-cases/post/get-post-detail/get-post-detail.usecase";
import type { GetPostsUseCase } from "@core/use-cases/post/get-posts";
import type { GetPostQuotesUseCase } from "@core/use-cases/post/get-post-quotes";
import type { UploadPostMediaUseCase } from "@core/use-cases/post/upload-post-media";
import { PostPrismaMapper } from "@infrastructure/persistence/mappers/post-prisma.mapper";
import type { PostCategory } from "@core/domain/enums/post-category-enum";
import { normalizeCategoryQuery } from "../utils/category-query";
import type { CreatePostBody } from "@typings/schemas/post/create-post.schema";
import type { DeletePostParams } from "@typings/schemas/post/delete-post.schema";
import type { GetPostParams } from "@typings/schemas/post/get-post.schema";
import type {
    GetPostQuotesParams,
    GetPostQuotesQuery,
} from "@typings/schemas/post/get-post-quotes.schema";
import type { GetPostsQuery } from "@typings/schemas/post/get-posts.schema";
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Controller for handling Post-related HTTP requests.
 *
 * This class acts as the HTTP interface for the Post domain. It orchestrates
 * incoming requests, extracts necessary payload/parameters, delegates business
 * logic to the respective Use Cases, and formats the outgoing HTTP responses.
 */
export class PostController {
    /**
     * Initializes a new instance of the PostController.
     *
     * @param createPostUseCase - Use case for creating a new post.
     * @param uploadPostMediaUseCase - Use case for handling media uploads.
     * @param getPostsUseCase - Use case for retrieving a paginated feed of posts.
     * @param deletePostUseCase - Use case for soft/hard deleting a post.
     * @param getPostDetailUseCase - Use case for fetching details of a specific post.
     * @param getPostQuotesUseCase - Use case for listing the posts quoting a post.
     */
    constructor(
        private readonly createPostUseCase: CreatePostUseCase,
        private readonly uploadPostMediaUseCase: UploadPostMediaUseCase,
        private readonly getPostsUseCase: GetPostsUseCase,
        private readonly deletePostUseCase: DeletePostUseCase,
        private readonly getPostDetailUseCase: GetPostDetailUseCase,
        private readonly getPostQuotesUseCase: GetPostQuotesUseCase,
    ) {}

    /**
     * Handles the creation of a new post.
     *
     * @param request - The Fastify request containing the CreatePostBody.
     * @param reply - The Fastify reply object.
     * @returns A 201 Created response containing the newly created post.
     */
    async create(
        request: FastifyRequest<{ Body: CreatePostBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        const authorId = request.user.id;
        const { content, type, mediaUrls, categories, quotedPostId } =
            request.body;

        const post = await this.createPostUseCase.execute({
            authorId,
            content,
            type,
            mediaUrls,
            categories,
            quotedPostId,
        });

        const cdnUrl = this.normalizeCdnUrl(
            request.server.config.R2_PUBLIC_URL,
        );

        return reply.status(201).send({
            data: PostPrismaMapper.toResponse(post, cdnUrl, authorId),
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    }

    /**
     * Handles the uploading of multipart media files for a post.
     * Maximum allowed files per upload is 4.
     *
     * @param request - The Fastify request containing multipart/form-data.
     * @param reply - The Fastify reply object.
     * @returns A 200 OK response containing an array of the uploaded media CDN URLs.
     * @throws {NoMediaProvidedError} If the request is not multipart or contains no files.
     * @throws {MediaLimitExceededError} If more than 4 files are uploaded.
     */
    async uploadMedia(
        request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        if (!request.isMultipart()) {
            throw new NoMediaProvidedError(
                "Please send a multipart/form-data request with at least one media file.",
            );
        }

        const userId = request.user.id;
        const r2PublicUrl = this.normalizeCdnUrl(
            request.server.config.R2_PUBLIC_URL,
        );

        const files = request.files();
        const uploadedUrls: string[] = [];
        let fileCount = 0;

        for await (const part of files) {
            fileCount++;

            if (fileCount > 4) {
                throw new MediaLimitExceededError();
            }

            const fileBuffer = await part.toBuffer();
            // The client's MIME type and file name are deliberately not passed
            // on: both are attacker-controlled, and the use case reads the
            // format out of the bytes instead.
            const uploadedPath = await this.uploadPostMediaUseCase.execute({
                userId,
                fileBuffer,
                truncated: part.file.truncated,
            });

            uploadedUrls.push(`${r2PublicUrl}/${uploadedPath}`);
        }

        if (uploadedUrls.length === 0) {
            throw new NoMediaProvidedError();
        }

        return reply.status(200).send({
            data: {
                mediaUrls: uploadedUrls,
            },
            meta: {
                timestamp: new Date().toISOString(),
            },
        });
    }

    /**
     * Retrieves a paginated feed of posts based on various filters.
     * Includes normalization of comma-separated or array-based category queries.
     *
     * @param request - The Fastify request containing the GetPostsQuery.
     * @param reply - The Fastify reply object.
     * @returns A 200 OK response with the list of posts and pagination metadata.
     */
    async getFeed(
        request: FastifyRequest<{ Querystring: GetPostsQuery }>,
        reply: FastifyReply,
    ): Promise<void> {
        const {
            page = 1,
            limit = 10,
            cursor,
            type,
            tag,
            followedOnly,
            categories: rawCategories,
        } = request.query;

        const categories = this.parseCategories(rawCategories);
        const currentUserId = request.user?.id;
        const cdnUrl = request.server.config.R2_PUBLIC_URL;

        const result = await this.getPostsUseCase.execute({
            page,
            limit,
            type,
            tag,
            followedOnly,
            categories,
            currentUserId,
            cursor,
            // Only ever a fallback: the ranker prefers the languages a signed-in
            // user chose, and reads the header for visitors and for users who
            // never set one.
            acceptLanguage: request.headers["accept-language"],
        });

        const formattedData = PostPrismaMapper.toFeedResponse(
            result.posts,
            cdnUrl,
            currentUserId,
        );

        return reply.status(200).send({
            data: formattedData,
            meta: {
                total: result.total,
                currentPage: page,
                limit,
                totalPages: Math.ceil(result.total / limit),
                nextCursor: result.nextCursor,
                // Read straight off the cursor, never inferred from the page
                // length. A short page used to be treated as the end of the
                // feed, which is wrong exactly where the ranked window runs
                // out mid-page: readers of a quiet feed were told there was
                // nothing left while hundreds of older posts sat behind it.
                // The use case knows when it has run out; it says so by
                // returning no cursor.
                hasMore: result.nextCursor !== null,
            },
        });
    }

    /**
     * Handles the deletion of a specific post.
     *
     * @param request - The Fastify request containing the Post ID in params.
     * @param reply - The Fastify reply object.
     * @returns A 204 No Content response upon successful deletion.
     */
    async deletePost(
        request: FastifyRequest<{ Params: DeletePostParams }>,
        reply: FastifyReply,
    ): Promise<void> {
        const userId = request.user.id;
        const postId = request.params.id;

        const rawCdnUrl = request.server.config.R2_PUBLIC_URL;
        const cdnBaseUrl = rawCdnUrl.endsWith("/")
            ? rawCdnUrl.slice(0, -1)
            : rawCdnUrl;

        await this.deletePostUseCase.execute({
            postId,
            userId,
            cdnBaseUrl,
        });

        return reply.status(204).send();
    }

    /**
     * Retrieves the detailed view of a single post.
     *
     * @param request - The Fastify request containing the Post ID in params.
     * @param reply - The Fastify reply object.
     * @returns A 200 OK response with the mapped Post object.
     */
    async getPost(
        request: FastifyRequest<{ Params: GetPostParams }>,
        reply: FastifyReply,
    ): Promise<void> {
        const { id } = request.params;
        const userId = request.user?.id;
        const cdnUrl = this.normalizeCdnUrl(
            request.server.config.R2_PUBLIC_URL,
        );

        const post = await this.getPostDetailUseCase.execute({
            postId: id,
            userId,
        });
        const formattedData = PostPrismaMapper.toResponse(post, cdnUrl, userId);

        return reply.status(200).send({
            data: formattedData,
        });
    }

    /**
     * Lists the posts quoting a given post, newest first.
     *
     * @param request - The Fastify request carrying the post ID and paging.
     * @param reply - The Fastify reply object.
     * @returns A 200 OK response with the page of quotes and pagination metadata.
     */
    async getQuotes(
        request: FastifyRequest<{
            Params: GetPostQuotesParams;
            Querystring: GetPostQuotesQuery;
        }>,
        reply: FastifyReply,
    ): Promise<void> {
        const { id } = request.params;
        const { page = 1, limit = 10 } = request.query;
        const currentUserId = request.user?.id;
        const cdnUrl = this.normalizeCdnUrl(
            request.server.config.R2_PUBLIC_URL,
        );

        const result = await this.getPostQuotesUseCase.execute({
            postId: id,
            page,
            limit,
            currentUserId,
        });

        return reply.status(200).send({
            data: PostPrismaMapper.toFeedResponse(
                result.posts,
                cdnUrl,
                currentUserId,
            ),
            meta: {
                total: result.total,
                currentPage: page,
                limit,
                totalPages: Math.ceil(result.total / limit),
            },
        });
    }

    /**
     * Helper method to normalize incoming raw categories from query parameters.
     *
     * The feed is deliberately lenient: an unrecognized category is dropped and
     * an all-unknown list falls back to an unfiltered feed rather than a 400.
     *
     * @param raw - The raw category string or string array from the query string.
     * @returns An array of validated PostCategory enums, or undefined if none are valid.
     * @private
     */
    private parseCategories(
        raw?: string | string[],
    ): PostCategory[] | undefined {
        const { categories } = normalizeCategoryQuery(raw);

        return categories.length > 0 ? categories : undefined;
    }

    /**
     * Normalize CDN base URL by removing trailing slash if present.
     */
    private normalizeCdnUrl(url?: string): string {
        if (!url) return "";
        return url.endsWith("/") ? url.slice(0, -1) : url;
    }
}
