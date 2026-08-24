import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetArticleUseCase } from "@core/use-cases/article/get-article";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import { ArticleStatus } from "@core/domain/enums/article-status.enum";
import { NotFoundError } from "@core/errors";
import { buildArticle } from "../../../helpers/mock-factories";

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";

describe("GetArticleUseCase", () => {
    let useCase: GetArticleUseCase;
    let articleRepository: Pick<IArticleRepository, "findBySlug">;

    beforeEach(() => {
        articleRepository = { findBySlug: vi.fn() };
        useCase = new GetArticleUseCase(
            articleRepository as IArticleRepository,
        );
    });

    it("should return a published article to a guest", async () => {
        vi.mocked(articleRepository.findBySlug).mockResolvedValue(
            buildArticle({
                status: ArticleStatus.PUBLISHED,
                author: { id: AUTHOR },
            }),
        );

        const article = await useCase.execute({ slug: "some-slug-1a2b3c4d" });

        expect(article.status).toBe(ArticleStatus.PUBLISHED);
    });

    it("should return the author's own draft to the author", async () => {
        vi.mocked(articleRepository.findBySlug).mockResolvedValue(
            buildArticle({
                status: ArticleStatus.DRAFT,
                author: { id: AUTHOR },
            }),
        );

        const article = await useCase.execute({
            slug: "draft-1a2b3c4d",
            viewerId: AUTHOR,
        });

        expect(article.status).toBe(ArticleStatus.DRAFT);
    });

    it("should throw NotFoundError when nothing matches the slug", async () => {
        vi.mocked(articleRepository.findBySlug).mockResolvedValue(null);

        await expect(useCase.execute({ slug: "missing" })).rejects.toThrow(
            NotFoundError,
        );
    });

    it("should hide a draft from a guest behind the same NotFoundError", async () => {
        vi.mocked(articleRepository.findBySlug).mockResolvedValue(
            buildArticle({
                status: ArticleStatus.DRAFT,
                author: { id: AUTHOR },
            }),
        );

        await expect(
            useCase.execute({ slug: "draft-1a2b3c4d" }),
        ).rejects.toThrow(NotFoundError);
    });

    it("should hide a draft from another authenticated user", async () => {
        vi.mocked(articleRepository.findBySlug).mockResolvedValue(
            buildArticle({
                status: ArticleStatus.DRAFT,
                author: { id: AUTHOR },
            }),
        );

        await expect(
            useCase.execute({ slug: "draft-1a2b3c4d", viewerId: STRANGER }),
        ).rejects.toThrow(NotFoundError);
    });

    it("should hide an archived article from everyone but its author", async () => {
        vi.mocked(articleRepository.findBySlug).mockResolvedValue(
            buildArticle({
                status: ArticleStatus.ARCHIVED,
                author: { id: AUTHOR },
            }),
        );

        await expect(
            useCase.execute({ slug: "archived-1a2b3c4d", viewerId: STRANGER }),
        ).rejects.toThrow(NotFoundError);

        const forAuthor = await useCase.execute({
            slug: "archived-1a2b3c4d",
            viewerId: AUTHOR,
        });
        expect(forAuthor.status).toBe(ArticleStatus.ARCHIVED);
    });

    it("should pass the viewer down so like flags resolve", async () => {
        vi.mocked(articleRepository.findBySlug).mockResolvedValue(
            buildArticle({ status: ArticleStatus.PUBLISHED }),
        );

        await useCase.execute({ slug: "s-1a2b3c4d", viewerId: STRANGER });

        expect(articleRepository.findBySlug).toHaveBeenCalledWith(
            "s-1a2b3c4d",
            STRANGER,
        );
    });
});
