import type { FastifyReply, FastifyRequest } from "fastify";
import type { CreateArticleUseCase } from "@core/use-cases/article/create-article";
import type { UpdateArticleUseCase } from "@core/use-cases/article/update-article";
import type { PublishArticleUseCase } from "@core/use-cases/article/publish-article";
import type { ArchiveArticleUseCase } from "@core/use-cases/article/archive-article";
import type { DeleteArticleUseCase } from "@core/use-cases/article/delete-article";
import type { GetArticlesUseCase } from "@core/use-cases/article/get-articles";
import type { GetArticleUseCase } from "@core/use-cases/article/get-article";
import type { GetMyArticlesUseCase } from "@core/use-cases/article/get-my-articles";
import type { UploadArticleCoverUseCase } from "@core/use-cases/article/upload-article-cover";
import { NoMediaProvidedError } from "@core/errors";
import { ArticlePrismaMapper } from "@infrastructure/persistence/mappers/article-prisma.mapper";
import type { CreateArticleBody } from "@typings/schemas/article/create-article.schema";
import type { UpdateArticleBody } from "@typings/schemas/article/update-article.schema";
import type { ArticleIdParams } from "@typings/schemas/article/article-params.schema";
import type { GetArticlesQuery } from "@typings/schemas/article/get-articles.schema";
import type { GetArticleParams } from "@typings/schemas/article/get-article.schema";
import type { GetMyArticlesQuery } from "@typings/schemas/article/get-my-articles.schema";

/**
 * Controller for article write operations.
 *
 * Every handler reads the author from the verified token rather than the
 * request body, so ownership cannot be spoofed by the caller.
 */
export class ArticleController {
    /**
     * Initializes a new instance of the ArticleController.
     *
     * @param createArticleUseCase - Use case for creating a draft article
     * @param updateArticleUseCase - Use case for editing an article
     * @param publishArticleUseCase - Use case for publishing an article
     * @param archiveArticleUseCase - Use case for archiving an article
     * @param deleteArticleUseCase - Use case for deleting an article
     * @param getArticlesUseCase - Use case for the public article list
     * @param getArticleUseCase - Use case for reading one article by slug
     * @param getMyArticlesUseCase - Use case for an author's own articles
     * @param uploadArticleCoverUseCase - Use case for storing a cover image
     */
    constructor(
        private readonly createArticleUseCase: CreateArticleUseCase,
        private readonly updateArticleUseCase: UpdateArticleUseCase,
        private readonly publishArticleUseCase: PublishArticleUseCase,
        private readonly archiveArticleUseCase: ArchiveArticleUseCase,
        private readonly deleteArticleUseCase: DeleteArticleUseCase,
        private readonly getArticlesUseCase: GetArticlesUseCase,
        private readonly getArticleUseCase: GetArticleUseCase,
        private readonly getMyArticlesUseCase: GetMyArticlesUseCase,
        private readonly uploadArticleCoverUseCase: UploadArticleCoverUseCase,
    ) {}

    /**
     * Creates a new article, always as a draft.
     *
     * @param request - Request carrying the article content
     * @param reply - The Fastify reply object
     * @returns A 201 response containing the created draft
     */
    async create(
        request: FastifyRequest<{ Body: CreateArticleBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        const authorId = request.user.id;

        const article = await this.createArticleUseCase.execute({
            authorId,
            ...request.body,
        });

        return reply.status(201).send({
            data: ArticlePrismaMapper.toResponse(
                article,
                this.cdnUrl(request),
                authorId,
            ),
            meta: { timestamp: new Date().toISOString() },
        });
    }

    /**
     * Applies an edit to an article the caller owns.
     *
     * @param request - Request carrying the changed fields
     * @param reply - The Fastify reply object
     * @returns A 200 response containing the updated article
     */
    async update(
        request: FastifyRequest<{
            Params: ArticleIdParams;
            Body: UpdateArticleBody;
        }>,
        reply: FastifyReply,
    ): Promise<void> {
        const userId = request.user.id;

        const article = await this.updateArticleUseCase.execute({
            articleId: request.params.id,
            userId,
            ...request.body,
        });

        return reply.status(200).send({
            data: ArticlePrismaMapper.toResponse(
                article,
                this.cdnUrl(request),
                userId,
            ),
            meta: { timestamp: new Date().toISOString() },
        });
    }

    /**
     * Publishes an article the caller owns.
     *
     * @param request - Request identifying the article
     * @param reply - The Fastify reply object
     * @returns A 200 response containing the published article
     */
    async publish(
        request: FastifyRequest<{ Params: ArticleIdParams }>,
        reply: FastifyReply,
    ): Promise<void> {
        const userId = request.user.id;

        const article = await this.publishArticleUseCase.execute({
            articleId: request.params.id,
            userId,
        });

        return reply.status(200).send({
            data: ArticlePrismaMapper.toResponse(
                article,
                this.cdnUrl(request),
                userId,
            ),
            meta: { timestamp: new Date().toISOString() },
        });
    }

    /**
     * Archives an article the caller owns.
     *
     * @param request - Request identifying the article
     * @param reply - The Fastify reply object
     * @returns A 200 response containing the archived article
     */
    async archive(
        request: FastifyRequest<{ Params: ArticleIdParams }>,
        reply: FastifyReply,
    ): Promise<void> {
        const userId = request.user.id;

        const article = await this.archiveArticleUseCase.execute({
            articleId: request.params.id,
            userId,
        });

        return reply.status(200).send({
            data: ArticlePrismaMapper.toResponse(
                article,
                this.cdnUrl(request),
                userId,
            ),
            meta: { timestamp: new Date().toISOString() },
        });
    }

    /**
     * Deletes an article the caller owns.
     *
     * @param request - Request identifying the article
     * @param reply - The Fastify reply object
     * @returns A 204 response with no body
     */
    async remove(
        request: FastifyRequest<{ Params: ArticleIdParams }>,
        reply: FastifyReply,
    ): Promise<void> {
        await this.deleteArticleUseCase.execute({
            articleId: request.params.id,
            userId: request.user.id,
        });

        return reply.status(204).send();
    }

    /**
     * Returns a page of published articles.
     *
     * @param request - Request carrying the pagination and filter query
     * @param reply - The Fastify reply object
     * @returns A 200 response with the page and its counts
     */
    async list(
        request: FastifyRequest<{ Querystring: GetArticlesQuery }>,
        reply: FastifyReply,
    ): Promise<void> {
        const currentUserId = request.user?.id;
        const { page = 1, limit = 10 } = request.query;

        const result = await this.getArticlesUseCase.execute({
            ...request.query,
            page,
            limit,
            currentUserId,
        });

        return reply.status(200).send({
            data: ArticlePrismaMapper.toListResponse(
                result.articles,
                this.cdnUrl(request),
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
     * Returns the authenticated author's own articles, drafts included.
     *
     * The author is read from the token, so this cannot be pointed at another
     * user by changing a parameter.
     *
     * @param request - Request carrying the pagination and status query
     * @param reply - The Fastify reply object
     * @returns A 200 response with the page and its counts
     */
    async mine(
        request: FastifyRequest<{ Querystring: GetMyArticlesQuery }>,
        reply: FastifyReply,
    ): Promise<void> {
        const authorId = request.user.id;
        const { page = 1, limit = 10, status } = request.query;

        const result = await this.getMyArticlesUseCase.execute({
            authorId,
            page,
            limit,
            status,
        });

        return reply.status(200).send({
            data: ArticlePrismaMapper.toListResponse(
                result.articles,
                this.cdnUrl(request),
                authorId,
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
     * Returns a single article by slug.
     *
     * @param request - Request carrying the slug
     * @param reply - The Fastify reply object
     * @returns A 200 response with the article
     */
    async detail(
        request: FastifyRequest<{ Params: GetArticleParams }>,
        reply: FastifyReply,
    ): Promise<void> {
        const viewerId = request.user?.id;

        const article = await this.getArticleUseCase.execute({
            slug: request.params.slug,
            viewerId,
        });

        return reply.status(200).send({
            data: ArticlePrismaMapper.toResponse(
                article,
                this.cdnUrl(request),
                viewerId,
            ),
            meta: { timestamp: new Date().toISOString() },
        });
    }

    /**
     * Stores a cover image and returns the key the article body accepts.
     *
     * Only the bytes are passed on: the multipart part's mimetype and filename
     * are both client-controlled and neither is forwarded anywhere.
     *
     * @param request - A multipart request carrying exactly one file
     * @param reply - The Fastify reply object
     * @returns A 200 response with the storage key and its public URL
     */
    async uploadCover(
        request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        if (!request.isMultipart()) {
            throw new NoMediaProvidedError(
                "Please send a multipart/form-data request with one image file.",
            );
        }

        const file = await request.file();

        if (!file) {
            throw new NoMediaProvidedError("No cover image was provided.");
        }

        const fileBuffer = await file.toBuffer();

        const coverImageKey = await this.uploadArticleCoverUseCase.execute({
            userId: request.user.id,
            fileBuffer,
            truncated: file.file.truncated,
        });

        return reply.status(200).send({
            data: {
                coverImageKey,
                coverImageUrl: this.cdnUrl(request) + "/" + coverImageKey,
            },
            meta: { timestamp: new Date().toISOString() },
        });
    }

    /**
     * Resolves the CDN base URL, without a trailing slash.
     *
     * @param request - The current request, used to reach the app config
     * @returns The CDN base URL
     */
    private cdnUrl(request: FastifyRequest): string {
        const url = request.server.config.R2_PUBLIC_URL;
        if (!url) return "";
        return url.endsWith("/") ? url.slice(0, -1) : url;
    }
}
