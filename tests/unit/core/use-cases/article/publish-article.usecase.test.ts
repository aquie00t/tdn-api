import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublishArticleUseCase } from "@core/use-cases/article/publish-article";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { CachePort } from "@core/ports/services/cache.port";
import type { Article } from "@core/domain/entities/article.entity";
import { ArticleStatus } from "@core/domain/enums/article-status.enum";
import {
    InvalidArticleStateError,
    NotFoundError,
    UnauthorizedActionError,
} from "@core/errors";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { NotifyMentionedUsersUseCase } from "@core/use-cases/notification/notify-mentioned-users";
import { buildArticle } from "../../../helpers/mock-factories";

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";

describe("PublishArticleUseCase", () => {
    let useCase: PublishArticleUseCase;
    let articleRepository: Pick<IArticleRepository, "findById" | "update">;
    let cacheService: Pick<CachePort, "deleteByPattern">;
    let notifyMentionedUsersUseCase: Pick<
        NotifyMentionedUsersUseCase,
        "execute"
    >;
    let logger: Pick<LoggerPort, "error">;

    beforeEach(() => {
        articleRepository = {
            findById: vi.fn(),
            update: vi.fn().mockImplementation((article: Article) => article),
        };
        cacheService = {
            deleteByPattern: vi.fn().mockResolvedValue(undefined),
        };
        notifyMentionedUsersUseCase = {
            execute: vi.fn().mockResolvedValue(0),
        };
        logger = { error: vi.fn() };
        useCase = new PublishArticleUseCase(
            articleRepository as IArticleRepository,
            cacheService as CachePort,
            notifyMentionedUsersUseCase as NotifyMentionedUsersUseCase,
            logger as LoggerPort,
        );
    });

    it("should publish a draft and stamp the publication date", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({
                author: { id: AUTHOR },
                status: ArticleStatus.DRAFT,
            }),
        );

        const published = await useCase.execute({
            articleId: "a1",
            userId: AUTHOR,
        });

        expect(published.status).toBe(ArticleStatus.PUBLISHED);
        expect(published.publishedAt).toBeInstanceOf(Date);
        expect(articleRepository.update).toHaveBeenCalledTimes(1);
    });

    it("should invalidate the public list cache", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({
                author: { id: AUTHOR },
                status: ArticleStatus.DRAFT,
            }),
        );

        await useCase.execute({ articleId: "a1", userId: AUTHOR });

        expect(cacheService.deleteByPattern).toHaveBeenCalledWith(
            "articles:list:*",
        );
    });

    it("should reject publishing an already published article", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({
                author: { id: AUTHOR },
                status: ArticleStatus.PUBLISHED,
            }),
        );

        await expect(
            useCase.execute({ articleId: "a1", userId: AUTHOR }),
        ).rejects.toThrow(InvalidArticleStateError);

        expect(articleRepository.update).not.toHaveBeenCalled();
    });

    it("should allow re-publishing an archived article", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({
                author: { id: AUTHOR },
                status: ArticleStatus.ARCHIVED,
                publishedAt: new Date("2026-01-01T00:00:00Z"),
            }),
        );

        const published = await useCase.execute({
            articleId: "a1",
            userId: AUTHOR,
        });

        expect(published.status).toBe(ArticleStatus.PUBLISHED);
        expect(published.publishedAt?.toISOString()).toBe(
            "2026-01-01T00:00:00.000Z",
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
    });

    it("should hide another user's archived article behind a 404", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({
                author: { id: AUTHOR },
                status: ArticleStatus.ARCHIVED,
            }),
        );

        await expect(
            useCase.execute({ articleId: "a1", userId: STRANGER }),
        ).rejects.toThrow(NotFoundError);
    });

    it("should forbid, not hide, a published article owned by someone else", async () => {
        vi.mocked(articleRepository.findById).mockResolvedValue(
            buildArticle({
                author: { id: AUTHOR },
                status: ArticleStatus.PUBLISHED,
            }),
        );

        await expect(
            useCase.execute({ articleId: "a1", userId: STRANGER }),
        ).rejects.toThrow(UnauthorizedActionError);
    });
    describe("mentions", () => {
        it("should tell everyone the draft named, now that they can read it", async () => {
            vi.mocked(articleRepository.findById).mockResolvedValue(
                buildArticle({
                    id: "a1",
                    slug: "hello-1a2b3c4d",
                    author: { id: AUTHOR },
                    status: ArticleStatus.DRAFT,
                    mentions: [{ id: "user-2", username: "ada" }],
                }),
            );

            await useCase.execute({ articleId: "a1", userId: AUTHOR });

            await vi.waitFor(() => {
                expect(
                    notifyMentionedUsersUseCase.execute,
                ).toHaveBeenCalledWith({
                    issuerId: AUTHOR,
                    mentionedUserIds: ["user-2"],
                    target: { articleId: "a1" },
                    articleSlug: "hello-1a2b3c4d",
                });
            });
        });

        it("should notify nobody when the article names nobody", async () => {
            vi.mocked(articleRepository.findById).mockResolvedValue(
                buildArticle({
                    author: { id: AUTHOR },
                    status: ArticleStatus.DRAFT,
                }),
            );

            await useCase.execute({ articleId: "a1", userId: AUTHOR });

            expect(notifyMentionedUsersUseCase.execute).not.toHaveBeenCalled();
        });

        it("should still publish when the notification fails", async () => {
            vi.mocked(articleRepository.findById).mockResolvedValue(
                buildArticle({
                    author: { id: AUTHOR },
                    status: ArticleStatus.DRAFT,
                    mentions: [{ id: "user-2", username: "ada" }],
                }),
            );
            vi.mocked(notifyMentionedUsersUseCase.execute).mockRejectedValue(
                new Error("notifier exploded"),
            );

            const published = await useCase.execute({
                articleId: "a1",
                userId: AUTHOR,
            });

            expect(published.status).toBe(ArticleStatus.PUBLISHED);
            await vi.waitFor(() => {
                expect(logger.error).toHaveBeenCalledOnce();
            });
        });
    });
});
