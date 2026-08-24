import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetMyArticlesUseCase } from "@core/use-cases/article/get-my-articles";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import { ArticleStatus } from "@core/domain/enums/article-status.enum";
import { buildArticle } from "../../../helpers/mock-factories";

const AUTHOR = "11111111-1111-4111-8111-111111111111";

describe("GetMyArticlesUseCase", () => {
    let useCase: GetMyArticlesUseCase;
    let articleRepository: Pick<IArticleRepository, "findByAuthorId">;

    beforeEach(() => {
        articleRepository = {
            findByAuthorId: vi.fn().mockResolvedValue({
                articles: [buildArticle({ status: ArticleStatus.DRAFT })],
                total: 1,
            }),
        };
        useCase = new GetMyArticlesUseCase(
            articleRepository as IArticleRepository,
        );
    });

    it("should query only the requesting author", async () => {
        await useCase.execute({ authorId: AUTHOR });

        expect(articleRepository.findByAuthorId).toHaveBeenCalledWith(
            expect.objectContaining({ authorId: AUTHOR }),
        );
    });

    it("should default pagination", async () => {
        await useCase.execute({ authorId: AUTHOR });

        expect(articleRepository.findByAuthorId).toHaveBeenCalledWith(
            expect.objectContaining({ page: 1, limit: 10 }),
        );
    });

    it("should pass a status filter through", async () => {
        await useCase.execute({
            authorId: AUTHOR,
            status: ArticleStatus.PUBLISHED,
        });

        expect(articleRepository.findByAuthorId).toHaveBeenCalledWith(
            expect.objectContaining({ status: ArticleStatus.PUBLISHED }),
        );
    });

    it("should return drafts", async () => {
        const result = await useCase.execute({ authorId: AUTHOR });

        expect(result.articles[0].status).toBe(ArticleStatus.DRAFT);
        expect(result.total).toBe(1);
    });
});
