import type { IMediaAssetRepository } from "@core/ports/repositories/media-asset.repository";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateArticleUseCase } from "@core/use-cases/article/update-article";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { CachePort } from "@core/ports/services/cache.port";
import type { Article } from "@core/domain/entities/article.entity";
import { ArticleStatus } from "@core/domain/enums/article-status.enum";
import {
    BadRequestError,
    NotFoundError,
    UnauthorizedActionError,
} from "@core/errors";
import { MediaOwnerKind } from "@core/domain/enums";
import { buildArticle } from "../../../helpers/mock-factories";

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";

describe("UpdateArticleUseCase", () => {
    let useCase: UpdateArticleUseCase;
    let articleRepository: Pick<IArticleRepository, "findById" | "update">;
    let cacheService: Pick<CachePort, "deleteByPattern">;
    let mediaAssetRepository: Pick<
        IMediaAssetRepository,
        "findByStorageKeys" | "attachToOwner" | "detachFromOwner"
    >;

    beforeEach(() => {
        articleRepository = {
            findById: vi.fn(),
            update: vi.fn().mockImplementation((article: Article) => article),
        };
        cacheService = {
            deleteByPattern: vi.fn().mockResolvedValue(undefined),
        };
        mediaAssetRepository = {
            findByStorageKeys: vi.fn().mockResolvedValue([]),
            attachToOwner: vi.fn().mockResolvedValue(1),
            detachFromOwner: vi.fn().mockResolvedValue(undefined),
        };
        useCase = new UpdateArticleUseCase(
            articleRepository as IArticleRepository,
            cacheService as CachePort,
            mediaAssetRepository as IMediaAssetRepository,
        );
    });

    it("should release the cover it supersedes before attaching the new one", async () => {
        // "Attached" has to keep meaning "in use": a purge job reading it any
        // other way would leave every replaced cover in storage forever.
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({ id: "article-1", author: { id: AUTHOR } }),
        );

        await useCase.execute({
            articleId: "article-1",
            userId: AUTHOR,
            coverImageKey: `articles/covers/${AUTHOR}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png`,
        });

        expect(mediaAssetRepository.detachFromOwner).toHaveBeenCalledWith(
            MediaOwnerKind.ARTICLE,
            "article-1",
        );
        expect(mediaAssetRepository.attachToOwner).toHaveBeenCalled();
    });

    it("should throw NotFoundError when the article does not exist", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(null);

        await expect(
            useCase.execute({
                articleId: "missing",
                userId: AUTHOR,
                title: "New",
            }),
        ).rejects.toThrow(NotFoundError);
    });

    it("should throw NotFoundError, not Forbidden, for someone else's draft", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({
                status: ArticleStatus.DRAFT,
                author: { id: AUTHOR },
            }),
        );

        await expect(
            useCase.execute({
                articleId: "a1",
                userId: STRANGER,
                title: "New",
            }),
        ).rejects.toThrow(NotFoundError);
    });

    it("should throw UnauthorizedActionError for a published article owned by someone else", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({
                status: ArticleStatus.PUBLISHED,
                author: { id: AUTHOR },
            }),
        );

        await expect(
            useCase.execute({
                articleId: "a1",
                userId: STRANGER,
                title: "New",
            }),
        ).rejects.toThrow(UnauthorizedActionError);
    });

    it("should apply the edit and persist it", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({ author: { id: AUTHOR }, title: "Before" }),
        );

        const updated = await useCase.execute({
            articleId: "a1",
            userId: AUTHOR,
            title: "After",
        });

        expect(articleRepository.update).toHaveBeenCalledTimes(1);
        expect(updated.title).toBe("After");
    });

    it("should never change the slug", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({ author: { id: AUTHOR }, slug: "original-1a2b3c4d" }),
        );

        const updated = await useCase.execute({
            articleId: "a1",
            userId: AUTHOR,
            title: "A totally different title",
        });

        expect(updated.slug).toBe("original-1a2b3c4d");
    });

    it("should not invalidate the public list cache for a draft", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({
                author: { id: AUTHOR },
                status: ArticleStatus.DRAFT,
            }),
        );

        await useCase.execute({
            articleId: "a1",
            userId: AUTHOR,
            title: "Draft edit",
        });

        expect(cacheService.deleteByPattern).not.toHaveBeenCalled();
    });

    it("should invalidate the public list cache when the article is published", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({
                author: { id: AUTHOR },
                status: ArticleStatus.PUBLISHED,
            }),
        );

        await useCase.execute({
            articleId: "a1",
            userId: AUTHOR,
            title: "Published edit",
        });

        expect(cacheService.deleteByPattern).toHaveBeenCalledWith(
            "articles:list:*",
        );
    });

    it("should reject an invalid tag without persisting anything", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({ author: { id: AUTHOR } }),
        );

        await expect(
            useCase.execute({
                articleId: "a1",
                userId: AUTHOR,
                tags: ["not a tag"],
            }),
        ).rejects.toThrow(BadRequestError);

        expect(articleRepository.update).not.toHaveBeenCalled();
    });
});
