import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteArticleUseCase } from "@core/use-cases/article/delete-article";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { CachePort } from "@core/ports/services/cache.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { StoragePort } from "@core/ports/services/storage.port";
import { ArticleStatus } from "@core/domain/enums/article-status.enum";
import { NotFoundError, UnauthorizedActionError } from "@core/errors";
import { buildArticle } from "../../../helpers/mock-factories";

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const COVER = `articles/covers/${AUTHOR}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png`;

describe("DeleteArticleUseCase", () => {
    let useCase: DeleteArticleUseCase;
    let articleRepository: Pick<IArticleRepository, "findById" | "delete">;
    let storageService: Pick<StoragePort, "delete">;
    let cacheService: Pick<CachePort, "deleteByPattern">;
    let logger: LoggerPort;

    beforeEach(() => {
        articleRepository = {
            findById: vi.fn(),
            delete: vi.fn().mockResolvedValue(undefined),
        };
        storageService = { delete: vi.fn().mockResolvedValue(undefined) };
        cacheService = {
            deleteByPattern: vi.fn().mockResolvedValue(undefined),
        };
        logger = { error: vi.fn() } as unknown as LoggerPort;

        useCase = new DeleteArticleUseCase(
            articleRepository as IArticleRepository,
            storageService as StoragePort,
            cacheService as CachePort,
            logger,
        );
    });

    it("should delete an article the caller owns", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({ author: { id: AUTHOR } }),
        );

        await useCase.execute({ articleId: "a1", userId: AUTHOR });

        expect(articleRepository.delete).toHaveBeenCalledWith("a1");
    });

    it("should remove the cover image from storage", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({ author: { id: AUTHOR }, coverImageKey: COVER }),
        );

        await useCase.execute({ articleId: "a1", userId: AUTHOR });

        expect(storageService.delete).toHaveBeenCalledWith(COVER);
    });

    it("should still delete the article when storage removal fails", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({ author: { id: AUTHOR }, coverImageKey: COVER }),
        );
        vi.mocked(storageService.delete).mockRejectedValue(
            new Error("bucket unavailable"),
        );

        await useCase.execute({ articleId: "a1", userId: AUTHOR });

        expect(logger.error).toHaveBeenCalled();
        expect(articleRepository.delete).toHaveBeenCalledWith("a1");
    });

    it("should not touch storage when there is no cover image", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({ author: { id: AUTHOR }, coverImageKey: null }),
        );

        await useCase.execute({ articleId: "a1", userId: AUTHOR });

        expect(storageService.delete).not.toHaveBeenCalled();
    });

    it("should invalidate the public list cache only for a published article", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({
                author: { id: AUTHOR },
                status: ArticleStatus.DRAFT,
            }),
        );

        await useCase.execute({ articleId: "a1", userId: AUTHOR });
        expect(cacheService.deleteByPattern).not.toHaveBeenCalled();

        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({
                author: { id: AUTHOR },
                status: ArticleStatus.PUBLISHED,
            }),
        );

        await useCase.execute({ articleId: "a2", userId: AUTHOR });
        expect(cacheService.deleteByPattern).toHaveBeenCalledWith(
            "articles:list:*",
        );
    });

    it("should hide another user's draft behind a 404", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({
                author: { id: AUTHOR },
                status: ArticleStatus.DRAFT,
            }),
        );

        await expect(
            useCase.execute({ articleId: "a1", userId: STRANGER }),
        ).rejects.toThrow(NotFoundError);

        expect(articleRepository.delete).not.toHaveBeenCalled();
    });

    it("should forbid deleting a published article owned by someone else", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({
                author: { id: AUTHOR },
                status: ArticleStatus.PUBLISHED,
            }),
        );

        await expect(
            useCase.execute({ articleId: "a1", userId: STRANGER }),
        ).rejects.toThrow(UnauthorizedActionError);

        expect(articleRepository.delete).not.toHaveBeenCalled();
    });
});
