import { beforeEach, describe, expect, it, vi } from "vitest";
import { LikeArticleUseCase } from "@core/use-cases/article/like-article";
import { UnlikeArticleUseCase } from "@core/use-cases/article/unlike-article";
import { SaveArticleBookmarkUseCase } from "@core/use-cases/article/save-article-bookmark";
import { RemoveArticleBookmarkUseCase } from "@core/use-cases/article/remove-article-bookmark";
import type {
    TransactionPort,
    TransactionContext,
} from "@core/ports/services/transaction.port";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { IArticleLikeRepository } from "@core/ports/repositories/article-like.repository";
import type { IArticleBookmarkRepository } from "@core/ports/repositories/article-bookmark.repository";
import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import { ArticleStatus } from "@core/domain/enums/article-status.enum";
import { NotificationType } from "@core/domain/enums/notification-type.enum";
import { NotFoundError } from "@core/errors";
import { buildArticle } from "../../../helpers/mock-factories";

const AUTHOR = "article-author-1";
const READER = "reader-1";
const ARTICLE = "article-1";

describe("article like and bookmark use cases", () => {
    let articleRepo: Pick<IArticleRepository, "findById">;
    let likeRepo: IArticleLikeRepository;
    let bookmarkRepo: IArticleBookmarkRepository;
    let notificationRepo: Pick<
        INotificationRepository,
        "create" | "deleteByTarget"
    >;
    let realtimeSvc: Pick<RealtimePort, "emitToUser">;
    let transactionSvc: Pick<TransactionPort, "runInTransaction">;

    beforeEach(() => {
        articleRepo = {
            findById: vi.fn().mockResolvedValue(
                buildArticle({
                    status: ArticleStatus.PUBLISHED,
                    author: { id: AUTHOR },
                }),
            ),
        };
        likeRepo = {
            like: vi.fn().mockResolvedValue(undefined),
            unlike: vi.fn().mockResolvedValue(undefined),
            isLiked: vi.fn().mockResolvedValue(false),
            incrementLikeCount: vi.fn().mockResolvedValue(undefined),
            decrementLikeCount: vi.fn().mockResolvedValue(undefined),
        };
        bookmarkRepo = {
            save: vi.fn().mockResolvedValue(undefined),
            remove: vi.fn().mockResolvedValue(undefined),
            isBookmarked: vi.fn().mockResolvedValue(false),
        };
        notificationRepo = {
            create: vi.fn(),
            deleteByTarget: vi.fn().mockResolvedValue(1),
        };
        realtimeSvc = { emitToUser: vi.fn() };
        transactionSvc = {
            runInTransaction: vi.fn().mockImplementation(async (work) =>
                work({
                    articleRepository: articleRepo as IArticleRepository,
                    articleLikeRepository: likeRepo,
                    notificationRepository:
                        notificationRepo as INotificationRepository,
                } as TransactionContext),
            ),
        };
    });

    describe("LikeArticleUseCase", () => {
        let useCase: LikeArticleUseCase;

        beforeEach(() => {
            useCase = new LikeArticleUseCase(
                transactionSvc as TransactionPort,
                realtimeSvc as RealtimePort,
            );
        });

        it("should record the like and bump the count", async () => {
            await useCase.execute({ articleId: ARTICLE, userId: READER });

            expect(likeRepo.like).toHaveBeenCalledWith(ARTICLE, READER);
            expect(likeRepo.incrementLikeCount).toHaveBeenCalledWith(ARTICLE);
        });

        it("should be idempotent when already liked", async () => {
            vi.mocked(likeRepo.isLiked).mockResolvedValue(true);

            await useCase.execute({ articleId: ARTICLE, userId: READER });

            expect(likeRepo.like).not.toHaveBeenCalled();
            expect(likeRepo.incrementLikeCount).not.toHaveBeenCalled();
        });

        it("should notify the author with a deep-linkable reference", async () => {
            await useCase.execute({ articleId: ARTICLE, userId: READER });

            expect(notificationRepo.create).toHaveBeenCalledTimes(1);
            expect(realtimeSvc.emitToUser).toHaveBeenCalledWith(
                AUTHOR,
                "new-notification",
                expect.objectContaining({
                    type: NotificationType.LIKE,
                    issuerId: READER,
                    articleId: ARTICLE,
                    referenceId: ARTICLE,
                }),
            );
        });

        it("should persist the liked article on the notification", async () => {
            await useCase.execute({ articleId: ARTICLE, userId: READER });

            const [notification] = vi.mocked(notificationRepo.create).mock
                .calls[0];
            expect(notification.articleId).toBe(ARTICLE);
            expect(notification.referenceId).toBe(ARTICLE);
            expect(notification.postId).toBeUndefined();
            expect(notification.commentId).toBeUndefined();
        });

        it("should not notify when the author likes their own article", async () => {
            await useCase.execute({ articleId: ARTICLE, userId: AUTHOR });

            expect(notificationRepo.create).not.toHaveBeenCalled();
        });

        it("should hide an unpublished article behind a 404", async () => {
            for (const status of [
                ArticleStatus.DRAFT,
                ArticleStatus.ARCHIVED,
            ]) {
                vi.mocked(articleRepo.findById).mockResolvedValue(
                    buildArticle({ status, author: { id: AUTHOR } }),
                );

                await expect(
                    useCase.execute({ articleId: ARTICLE, userId: READER }),
                ).rejects.toThrow(NotFoundError);
            }

            expect(likeRepo.like).not.toHaveBeenCalled();
        });

        it("should throw NotFoundError when the article does not exist", async () => {
            vi.mocked(articleRepo.findById).mockResolvedValue(null);

            await expect(
                useCase.execute({ articleId: ARTICLE, userId: READER }),
            ).rejects.toThrow(NotFoundError);
        });
    });

    describe("UnlikeArticleUseCase", () => {
        let useCase: UnlikeArticleUseCase;

        beforeEach(() => {
            useCase = new UnlikeArticleUseCase(
                transactionSvc as TransactionPort,
            );
        });

        it("should remove the like and drop the count", async () => {
            vi.mocked(likeRepo.isLiked).mockResolvedValue(true);

            await useCase.execute({ articleId: ARTICLE, userId: READER });

            expect(likeRepo.unlike).toHaveBeenCalledWith(ARTICLE, READER);
            expect(likeRepo.decrementLikeCount).toHaveBeenCalledWith(ARTICLE);
        });

        it("should not let the count go negative when never liked", async () => {
            vi.mocked(likeRepo.isLiked).mockResolvedValue(false);

            await useCase.execute({ articleId: ARTICLE, userId: READER });

            expect(likeRepo.unlike).not.toHaveBeenCalled();
            expect(likeRepo.decrementLikeCount).not.toHaveBeenCalled();
        });

        it("should take back the notification the like had produced", async () => {
            vi.mocked(likeRepo.isLiked).mockResolvedValue(true);

            await useCase.execute({ articleId: ARTICLE, userId: READER });

            expect(notificationRepo.deleteByTarget).toHaveBeenCalledWith({
                recipientId: AUTHOR,
                issuerId: READER,
                type: NotificationType.LIKE,
                articleId: ARTICLE,
            });
        });

        it("should not touch notifications when there was no like to undo", async () => {
            vi.mocked(likeRepo.isLiked).mockResolvedValue(false);

            await useCase.execute({ articleId: ARTICLE, userId: READER });

            expect(notificationRepo.deleteByTarget).not.toHaveBeenCalled();
        });
    });

    describe("SaveArticleBookmarkUseCase", () => {
        let useCase: SaveArticleBookmarkUseCase;

        beforeEach(() => {
            useCase = new SaveArticleBookmarkUseCase(
                articleRepo as IArticleRepository,
                bookmarkRepo,
            );
        });

        it("should store the bookmark", async () => {
            await useCase.execute({ articleId: ARTICLE, userId: READER });

            expect(bookmarkRepo.save).toHaveBeenCalledWith(ARTICLE, READER);
        });

        it("should be idempotent", async () => {
            vi.mocked(bookmarkRepo.isBookmarked).mockResolvedValue(true);

            await useCase.execute({ articleId: ARTICLE, userId: READER });

            expect(bookmarkRepo.save).not.toHaveBeenCalled();
        });

        it("should refuse to bookmark an unpublished article", async () => {
            vi.mocked(articleRepo.findById).mockResolvedValue(
                buildArticle({
                    status: ArticleStatus.DRAFT,
                    author: { id: AUTHOR },
                }),
            );

            await expect(
                useCase.execute({ articleId: ARTICLE, userId: READER }),
            ).rejects.toThrow(NotFoundError);
        });
    });

    describe("RemoveArticleBookmarkUseCase", () => {
        let useCase: RemoveArticleBookmarkUseCase;

        beforeEach(() => {
            useCase = new RemoveArticleBookmarkUseCase(bookmarkRepo);
        });

        it("should remove an existing bookmark", async () => {
            vi.mocked(bookmarkRepo.isBookmarked).mockResolvedValue(true);

            await useCase.execute({ articleId: ARTICLE, userId: READER });

            expect(bookmarkRepo.remove).toHaveBeenCalledWith(ARTICLE, READER);
        });

        it("should do nothing when there is no bookmark", async () => {
            await useCase.execute({ articleId: ARTICLE, userId: READER });

            expect(bookmarkRepo.remove).not.toHaveBeenCalled();
        });

        it("should not load the article, so an archived one can still be unbookmarked", async () => {
            vi.mocked(bookmarkRepo.isBookmarked).mockResolvedValue(true);

            await useCase.execute({ articleId: ARTICLE, userId: READER });

            expect(articleRepo.findById).not.toHaveBeenCalled();
            expect(bookmarkRepo.remove).toHaveBeenCalled();
        });
    });
});
