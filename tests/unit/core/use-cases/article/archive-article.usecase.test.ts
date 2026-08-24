import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArchiveArticleUseCase } from "@core/use-cases/article/archive-article";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { CachePort } from "@core/ports/services/cache.port";
import type { Article } from "@core/domain/entities/article.entity";
import { ArticleStatus } from "@core/domain/enums/article-status.enum";
import { InvalidArticleStateError, NotFoundError } from "@core/errors";
import { buildArticle } from "../../../helpers/mock-factories";

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";

describe("ArchiveArticleUseCase", () => {
    let useCase: ArchiveArticleUseCase;
    let articleRepository: Pick<IArticleRepository, "findById" | "update">;
    let cacheService: Pick<CachePort, "deleteByPattern">;

    beforeEach(() => {
        articleRepository = {
            findById: vi.fn(),
            update: vi.fn().mockImplementation((article: Article) => article),
        };
        cacheService = {
            deleteByPattern: vi.fn().mockResolvedValue(undefined),
        };
        useCase = new ArchiveArticleUseCase(
            articleRepository as IArticleRepository,
            cacheService as CachePort,
        );
    });

    it("should archive a published article", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({
                author: { id: AUTHOR },
                status: ArticleStatus.PUBLISHED,
            }),
        );

        const archived = await useCase.execute({
            articleId: "a1",
            userId: AUTHOR,
        });

        expect(archived.status).toBe(ArticleStatus.ARCHIVED);
        expect(cacheService.deleteByPattern).toHaveBeenCalledWith(
            "articles:list:*",
        );
    });

    it("should reject archiving a draft that was never published", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({
                author: { id: AUTHOR },
                status: ArticleStatus.DRAFT,
            }),
        );

        await expect(
            useCase.execute({ articleId: "a1", userId: AUTHOR }),
        ).rejects.toThrow(InvalidArticleStateError);

        expect(articleRepository.update).not.toHaveBeenCalled();
    });

    it("should reject archiving an already archived article", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({
                author: { id: AUTHOR },
                status: ArticleStatus.ARCHIVED,
            }),
        );

        await expect(
            useCase.execute({ articleId: "a1", userId: AUTHOR }),
        ).rejects.toThrow(InvalidArticleStateError);
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
    });
});
