import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateArticleUseCase } from "@core/use-cases/article/create-article";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { CryptoPort } from "@core/ports/services/crypto.port";
import type { Article } from "@core/domain/entities/article.entity";
import { ArticleStatus } from "@core/domain/enums/article-status.enum";
import { PostCategory } from "@core/domain/enums/post-category-enum";
import { BadRequestError } from "@core/errors";

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const FILE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("CreateArticleUseCase", () => {
    let useCase: CreateArticleUseCase;
    let articleRepository: Pick<IArticleRepository, "create">;
    let cryptoService: Pick<CryptoPort, "generateRandomHex">;

    /**
     * Returns the entity the use case handed to the repository.
     */
    const created = (): Article =>
        vi.mocked(articleRepository.create).mock.calls[0][0];

    beforeEach(() => {
        articleRepository = {
            create: vi.fn().mockImplementation((article: Article) => article),
        };
        cryptoService = {
            generateRandomHex: vi.fn().mockReturnValue("1a2b3c4d"),
        };
        useCase = new CreateArticleUseCase(
            articleRepository as IArticleRepository,
            cryptoService as CryptoPort,
        );
    });

    it("should always create the article as a draft", async () => {
        await useCase.execute({
            authorId: AUTHOR,
            title: "My article",
            body: "Some prose.",
        });

        expect(created().status).toBe(ArticleStatus.DRAFT);
        expect(created().publishedAt).toBeNull();
    });

    it("should build the slug from the title and the random suffix", async () => {
        await useCase.execute({
            authorId: AUTHOR,
            title: "Hello Brave World",
            body: "Some prose.",
        });

        expect(cryptoService.generateRandomHex).toHaveBeenCalledWith(4);
        expect(created().slug).toBe("hello-brave-world-1a2b3c4d");
    });

    it("should take the author from the input, not the body", async () => {
        await useCase.execute({
            authorId: AUTHOR,
            title: "Ownership",
            body: "Some prose.",
        });

        expect(created().author.id).toBe(AUTHOR);
    });

    it("should normalize tags before persisting", async () => {
        await useCase.execute({
            authorId: AUTHOR,
            title: "Tagged",
            body: "Some prose.",
            tags: [" Fastify ", "fastify", "PRISMA"],
        });

        expect(created().tags).toEqual(["fastify", "prisma"]);
    });

    it("should reject a cover image key belonging to another user", async () => {
        await expect(
            useCase.execute({
                authorId: AUTHOR,
                title: "Stolen cover",
                body: "Some prose.",
                coverImageKey: `articles/covers/${OTHER}/${FILE}.png`,
            }),
        ).rejects.toThrow(BadRequestError);

        expect(articleRepository.create).not.toHaveBeenCalled();
    });

    it("should accept the author's own cover image key", async () => {
        const key = `articles/covers/${AUTHOR}/${FILE}.png`;

        await useCase.execute({
            authorId: AUTHOR,
            title: "Own cover",
            body: "Some prose.",
            coverImageKey: key,
        });

        expect(created().coverImageKey).toBe(key);
    });

    it("should reject a body containing a null byte", async () => {
        await expect(
            useCase.execute({
                authorId: AUTHOR,
                title: "Bad body",
                body: "before" + String.fromCharCode(0) + "after",
            }),
        ).rejects.toThrow(BadRequestError);
    });

    it("should store the markdown body unchanged", async () => {
        const body = "# Title\n\n<script>alert(1)</script>";

        await useCase.execute({
            authorId: AUTHOR,
            title: "Raw markdown",
            body,
        });

        expect(created().body).toBe(body);
    });

    it("should pass categories through", async () => {
        await useCase.execute({
            authorId: AUTHOR,
            title: "Categorized",
            body: "Some prose.",
            categories: [PostCategory.BACKEND],
        });

        expect(created().categories).toEqual([PostCategory.BACKEND]);
    });
});
