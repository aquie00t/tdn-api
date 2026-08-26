import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateCommentUseCase } from "@core/use-cases/comment/create-comment/create-comment.usecase";
import {
    ArticleNotPublishedError,
    BadRequestError,
    NotFoundError,
} from "@core/errors";
import type {
    TransactionPort,
    TransactionContext,
} from "@core/ports/services/transaction.port";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import type { ICommentRepository } from "@core/ports/repositories/comment.repository";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import type { Comment } from "@core/domain/entities/comment.entity";
import { ArticleStatus } from "@core/domain/enums/article-status.enum";
import { NotificationType } from "@core/domain/enums/notification-type.enum";
import { buildArticle, buildComment } from "../../../helpers/mock-factories";

const AUTHOR = "article-author-1";
const COMMENTER = "commenter-1";
const ARTICLE_TARGET = { type: "ARTICLE" as const, id: "article-1" };

/**
 * The article-comment half of CreateCommentUseCase. The post half lives in
 * create-comment.usecase.test.ts and is deliberately left untouched, so it
 * doubles as the regression gate for this change.
 */
describe("CreateCommentUseCase (article target)", () => {
    let useCase: CreateCommentUseCase;
    let transactionSvc: Pick<TransactionPort, "runInTransaction">;
    let realtimeSvc: Pick<RealtimePort, "emitToUser">;
    let txArticleRepo: Pick<IArticleRepository, "findById">;
    let txPostRepo: Pick<
        IPostRepository,
        "findById" | "incrementCommentsCount"
    >;
    let txCommentRepo: Pick<
        ICommentRepository,
        "findById" | "create" | "incrementRepliesCount"
    >;
    let txNotificationRepo: Pick<INotificationRepository, "create">;

    beforeEach(() => {
        txArticleRepo = {
            findById: vi.fn().mockResolvedValue(
                buildArticle({
                    status: ArticleStatus.PUBLISHED,
                    author: { id: AUTHOR },
                }),
            ),
        };
        txPostRepo = {
            findById: vi.fn(),
            incrementCommentsCount: vi.fn(),
        };
        txCommentRepo = {
            findById: vi.fn(),
            create: vi
                .fn()
                .mockImplementation((comment: Comment) =>
                    Promise.resolve(comment),
                ),
            incrementRepliesCount: vi.fn(),
        };
        txNotificationRepo = { create: vi.fn() };
        realtimeSvc = { emitToUser: vi.fn() };
        transactionSvc = {
            runInTransaction: vi.fn().mockImplementation(async (work) =>
                work({
                    articleRepository: txArticleRepo as IArticleRepository,
                    postRepository: txPostRepo as IPostRepository,
                    commentRepository: txCommentRepo as ICommentRepository,
                    notificationRepository:
                        txNotificationRepo as INotificationRepository,
                } as TransactionContext),
            ),
        };

        useCase = new CreateCommentUseCase(
            transactionSvc as TransactionPort,
            realtimeSvc as RealtimePort,
        );
    });

    it("should create a comment attached to the article", async () => {
        const comment = await useCase.execute({
            content: "Nice piece",
            target: ARTICLE_TARGET,
            authorId: COMMENTER,
        });

        expect(comment.articleId).toBe("article-1");
        expect(comment.postId).toBeNull();
        expect(comment.target).toEqual(ARTICLE_TARGET);
    });

    it("should not touch the post comment counter", async () => {
        await useCase.execute({
            content: "Nice piece",
            target: ARTICLE_TARGET,
            authorId: COMMENTER,
        });

        expect(txPostRepo.incrementCommentsCount).not.toHaveBeenCalled();
    });

    it("should throw NotFoundError when the article does not exist", async () => {
        vi.mocked(txArticleRepo.findById).mockResolvedValue(null);

        await expect(
            useCase.execute({
                content: "Hello",
                target: ARTICLE_TARGET,
                authorId: COMMENTER,
            }),
        ).rejects.toThrow(NotFoundError);
    });

    it("should hide someone else's draft behind a 404 rather than a conflict", async () => {
        vi.mocked(txArticleRepo.findById).mockResolvedValue(
            buildArticle({
                status: ArticleStatus.DRAFT,
                author: { id: AUTHOR },
            }),
        );

        // A stranger must not be able to tell an unpublished article from one
        // that does not exist: a distinct status code would confirm the draft.
        await expect(
            useCase.execute({
                content: "Hello",
                target: ARTICLE_TARGET,
                authorId: COMMENTER,
            }),
        ).rejects.toThrow(NotFoundError);

        expect(txCommentRepo.create).not.toHaveBeenCalled();
    });

    it("should tell the author their own draft is not published yet", async () => {
        vi.mocked(txArticleRepo.findById).mockResolvedValue(
            buildArticle({
                status: ArticleStatus.DRAFT,
                author: { id: AUTHOR },
            }),
        );

        await expect(
            useCase.execute({
                content: "Talking to myself",
                target: ARTICLE_TARGET,
                authorId: AUTHOR,
            }),
        ).rejects.toThrow(ArticleNotPublishedError);

        expect(txCommentRepo.create).not.toHaveBeenCalled();
    });

    it("should refuse to comment on an archived article", async () => {
        vi.mocked(txArticleRepo.findById).mockResolvedValue(
            buildArticle({
                status: ArticleStatus.ARCHIVED,
                author: { id: AUTHOR },
            }),
        );

        // Archived is visible to its author only, so the two callers get the
        // same split as a draft does.
        await expect(
            useCase.execute({
                content: "Hello",
                target: ARTICLE_TARGET,
                authorId: COMMENTER,
            }),
        ).rejects.toThrow(NotFoundError);

        await expect(
            useCase.execute({
                content: "Hello",
                target: ARTICLE_TARGET,
                authorId: AUTHOR,
            }),
        ).rejects.toThrow(ArticleNotPublishedError);
    });

    it("should notify the article author of a top-level comment", async () => {
        await useCase.execute({
            content: "Nice piece",
            target: ARTICLE_TARGET,
            authorId: COMMENTER,
        });

        expect(txNotificationRepo.create).toHaveBeenCalledTimes(1);
        expect(realtimeSvc.emitToUser).toHaveBeenCalledWith(
            AUTHOR,
            "new-notification",
            expect.objectContaining({
                type: NotificationType.COMMENT,
                issuerId: COMMENTER,
                articleId: "article-1",
                postId: undefined,
            }),
        );

        const [notification] = vi.mocked(txNotificationRepo.create).mock
            .calls[0];
        expect(notification.articleId).toBe("article-1");
        expect(notification.postId).toBeUndefined();
    });

    it("should persist the new comment as the notification target", async () => {
        vi.mocked(txCommentRepo.create).mockResolvedValueOnce(
            buildComment({
                id: "new-comment-9",
                postId: null,
                articleId: "article-1",
                authorId: COMMENTER,
            }),
        );

        await useCase.execute({
            content: "Nice piece",
            target: ARTICLE_TARGET,
            authorId: COMMENTER,
        });

        const [notification] = vi.mocked(txNotificationRepo.create).mock
            .calls[0];
        expect(notification.commentId).toBe("new-comment-9");
        expect(notification.referenceId).toBe("new-comment-9");
    });

    it("should send the article slug so the client can build the URL", async () => {
        await useCase.execute({
            content: "Nice piece",
            target: ARTICLE_TARGET,
            authorId: COMMENTER,
        });

        expect(realtimeSvc.emitToUser).toHaveBeenCalledWith(
            AUTHOR,
            "new-notification",
            expect.objectContaining({ articleSlug: expect.any(String) }),
        );
    });

    it("should populate referenceId with the new comment", async () => {
        const comment = await useCase.execute({
            content: "Nice piece",
            target: ARTICLE_TARGET,
            authorId: COMMENTER,
        });

        expect(realtimeSvc.emitToUser).toHaveBeenCalledWith(
            AUTHOR,
            "new-notification",
            expect.objectContaining({ referenceId: comment.id }),
        );
    });

    it("should not notify when the author comments on their own article", async () => {
        await useCase.execute({
            content: "Following up",
            target: ARTICLE_TARGET,
            authorId: AUTHOR,
        });

        expect(txNotificationRepo.create).not.toHaveBeenCalled();
        expect(realtimeSvc.emitToUser).not.toHaveBeenCalled();
    });

    it("should use COMMENT_REPLY when replying to another user's comment", async () => {
        vi.mocked(txCommentRepo.findById).mockResolvedValue(
            buildComment({
                id: "parent-1",
                postId: null,
                articleId: "article-1",
                authorId: "parent-author",
            }),
        );

        await useCase.execute({
            content: "Agreed",
            target: ARTICLE_TARGET,
            authorId: COMMENTER,
            parentId: "parent-1",
        });

        expect(txCommentRepo.incrementRepliesCount).toHaveBeenCalledWith(
            "parent-1",
        );
        expect(realtimeSvc.emitToUser).toHaveBeenCalledWith(
            "parent-author",
            "new-notification",
            expect.objectContaining({
                type: NotificationType.COMMENT_REPLY,
            }),
        );
    });

    it("should reject a parent comment that belongs to a post", async () => {
        vi.mocked(txCommentRepo.findById).mockResolvedValue(
            buildComment({
                id: "parent-1",
                postId: "post-1",
                articleId: null,
            }),
        );

        await expect(
            useCase.execute({
                content: "Wrong thread",
                target: ARTICLE_TARGET,
                authorId: COMMENTER,
                parentId: "parent-1",
            }),
        ).rejects.toThrow(BadRequestError);
    });

    it("should reject a parent comment from a different article", async () => {
        vi.mocked(txCommentRepo.findById).mockResolvedValue(
            buildComment({
                id: "parent-1",
                postId: null,
                articleId: "another-article",
            }),
        );

        await expect(
            useCase.execute({
                content: "Wrong thread",
                target: ARTICLE_TARGET,
                authorId: COMMENTER,
                parentId: "parent-1",
            }),
        ).rejects.toThrow(BadRequestError);
    });
});
