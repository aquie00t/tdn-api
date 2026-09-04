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
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { NotifyMentionedUsersUseCase } from "@core/use-cases/notification/notify-mentioned-users";
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
    let userRepository: Pick<IUserRepository, "findManyByUsernames">;
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
        mediaAssetRepository = {
            findByStorageKeys: vi.fn().mockResolvedValue([]),
            attachToOwner: vi.fn().mockResolvedValue(1),
            detachFromOwner: vi.fn().mockResolvedValue(undefined),
        };
        userRepository = {
            findManyByUsernames: vi.fn().mockResolvedValue([]),
        };
        notifyMentionedUsersUseCase = {
            execute: vi.fn().mockResolvedValue(0),
        };
        logger = { error: vi.fn() };
        useCase = new UpdateArticleUseCase(
            articleRepository as IArticleRepository,
            cacheService as CachePort,
            mediaAssetRepository as IMediaAssetRepository,
            userRepository as IUserRepository,
            notifyMentionedUsersUseCase as NotifyMentionedUsersUseCase,
            logger as LoggerPort,
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
    describe("mentions", () => {
        it("should re-resolve the mentions when the body changes", async () => {
            vi.mocked(articleRepository.findById).mockResolvedValue(
                buildArticle({ author: { id: AUTHOR } }),
            );
            vi.mocked(userRepository.findManyByUsernames).mockResolvedValue([
                { id: "user-2", username: "ada" },
            ]);

            const updated = await useCase.execute({
                articleId: "a1",
                userId: AUTHOR,
                body: "a much longer body that names @ada in it",
            });

            expect(userRepository.findManyByUsernames).toHaveBeenCalledWith([
                "ada",
            ]);
            expect(updated.mentions).toEqual([
                { id: "user-2", username: "ada" },
            ]);
        });

        it("should leave the mentions alone when the body is untouched", async () => {
            vi.mocked(articleRepository.findById).mockResolvedValue(
                buildArticle({
                    author: { id: AUTHOR },
                    mentions: [{ id: "user-2", username: "ada" }],
                }),
            );

            const updated = await useCase.execute({
                articleId: "a1",
                userId: AUTHOR,
                title: "A new title",
            });

            expect(userRepository.findManyByUsernames).not.toHaveBeenCalled();
            expect(updated.mentions).toEqual([
                { id: "user-2", username: "ada" },
            ]);
        });

        it("should notify only the people the edit newly named", async () => {
            vi.mocked(articleRepository.findById).mockResolvedValue(
                buildArticle({
                    id: "a1",
                    slug: "hello-1a2b3c4d",
                    author: { id: AUTHOR },
                    status: ArticleStatus.PUBLISHED,
                    mentions: [{ id: "user-2", username: "ada" }],
                }),
            );
            vi.mocked(userRepository.findManyByUsernames).mockResolvedValue([
                { id: "user-2", username: "ada" },
                { id: "user-3", username: "zoe" },
            ]);

            await useCase.execute({
                articleId: "a1",
                userId: AUTHOR,
                body: "a much longer body naming @ada and @zoe together",
            });

            await vi.waitFor(() => {
                expect(
                    notifyMentionedUsersUseCase.execute,
                ).toHaveBeenCalledWith({
                    issuerId: AUTHOR,
                    mentionedUserIds: ["user-3"],
                    target: { articleId: "a1" },
                    articleSlug: "hello-1a2b3c4d",
                });
            });
        });

        it("should notify nobody when a draft is edited", async () => {
            vi.mocked(articleRepository.findById).mockResolvedValue(
                buildArticle({
                    author: { id: AUTHOR },
                    status: ArticleStatus.DRAFT,
                }),
            );
            vi.mocked(userRepository.findManyByUsernames).mockResolvedValue([
                { id: "user-2", username: "ada" },
            ]);

            await useCase.execute({
                articleId: "a1",
                userId: AUTHOR,
                body: "a much longer draft body that names @ada in it",
            });

            expect(notifyMentionedUsersUseCase.execute).not.toHaveBeenCalled();
        });

        it("should not notify the same people again on a later edit", async () => {
            vi.mocked(articleRepository.findById).mockResolvedValue(
                buildArticle({
                    author: { id: AUTHOR },
                    status: ArticleStatus.PUBLISHED,
                    mentions: [{ id: "user-2", username: "ada" }],
                }),
            );
            vi.mocked(userRepository.findManyByUsernames).mockResolvedValue([
                { id: "user-2", username: "ada" },
            ]);

            await useCase.execute({
                articleId: "a1",
                userId: AUTHOR,
                body: "a much longer body still naming @ada as before",
            });

            expect(notifyMentionedUsersUseCase.execute).not.toHaveBeenCalled();
        });
    });
});
