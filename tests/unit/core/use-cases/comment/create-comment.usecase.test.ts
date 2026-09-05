import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateCommentUseCase } from "@core/use-cases/comment/create-comment/create-comment.usecase";
import { NotFoundError, BadRequestError } from "@core/errors";
import type {
    TransactionPort,
    TransactionContext,
} from "@core/ports/services/transaction.port";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import type { ICommentRepository } from "@core/ports/repositories/comment.repository";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import type { Comment } from "@core/domain/entities/comment.entity";
import type { Post } from "@core/domain/entities/post.entity";
import {
    buildComment,
    buildBlockRepository,
} from "../../../helpers/mock-factories";
import type { IMediaAssetRepository } from "@core/ports/repositories/media-asset.repository";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { NotifyMentionedUsersUseCase } from "@core/use-cases/notification/notify-mentioned-users";

const CDN_URL = "https://cdn.example.com";

const buildPost = (authorId = "author-1"): Post =>
    ({
        id: "post-1",
        author: { id: authorId },
    }) as unknown as Post;

describe("CreateCommentUseCase", () => {
    let useCase: CreateCommentUseCase;
    let transactionSvc: Pick<TransactionPort, "runInTransaction">;
    let realtimeSvc: Pick<RealtimePort, "emitToUser">;
    let mediaAssetRepo: Pick<
        IMediaAssetRepository,
        "findByStorageKeys" | "attachToOwner"
    >;
    let txPostRepo: Pick<
        IPostRepository,
        "findById" | "incrementCommentsCount"
    >;
    let txCommentRepo: Pick<
        ICommentRepository,
        "findById" | "create" | "incrementRepliesCount"
    >;
    let txNotificationRepo: Pick<INotificationRepository, "create">;
    let userRepo: Pick<IUserRepository, "findManyByUsernames">;
    let notifyMentionedUsersUseCase: Pick<
        NotifyMentionedUsersUseCase,
        "execute"
    >;
    let logger: Pick<LoggerPort, "error">;

    const buildTransactionContext = (): TransactionContext =>
        ({
            postRepository: txPostRepo as IPostRepository,
            commentRepository: txCommentRepo as ICommentRepository,
            notificationRepository:
                txNotificationRepo as INotificationRepository,
            mediaAssetRepository: mediaAssetRepo as IMediaAssetRepository,
            blockRepository: buildBlockRepository(),
        }) as TransactionContext;

    beforeEach(() => {
        txPostRepo = {
            findById: vi.fn(),
            incrementCommentsCount: vi.fn(),
        };
        txCommentRepo = {
            findById: vi.fn(),
            create: vi.fn(),
            incrementRepliesCount: vi.fn(),
        };
        txNotificationRepo = { create: vi.fn() };
        realtimeSvc = { emitToUser: vi.fn() };
        mediaAssetRepo = {
            findByStorageKeys: vi.fn().mockResolvedValue([]),
            attachToOwner: vi.fn().mockResolvedValue(1),
        };
        transactionSvc = { runInTransaction: vi.fn() };
        userRepo = {
            findManyByUsernames: vi.fn().mockResolvedValue([]),
        };
        notifyMentionedUsersUseCase = {
            execute: vi.fn().mockResolvedValue(0),
        };
        logger = { error: vi.fn() };

        vi.mocked(transactionSvc.runInTransaction).mockImplementation(
            async (work) => work(buildTransactionContext()),
        );

        useCase = new CreateCommentUseCase(
            transactionSvc as TransactionPort,
            realtimeSvc as RealtimePort,
            mediaAssetRepo as IMediaAssetRepository,
            CDN_URL,
            userRepo as IUserRepository,
            notifyMentionedUsersUseCase as NotifyMentionedUsersUseCase,
            logger as LoggerPort,
        );
    });

    it("should throw NotFoundError when post does not exist", async () => {
        vi.mocked(txPostRepo.findById).mockResolvedValue(null);

        await expect(
            useCase.execute({
                content: "Hello",
                target: { type: "POST" as const, id: "post-1" },
                authorId: "user-1",
            }),
        ).rejects.toThrow(NotFoundError);
    });

    it("should throw NotFoundError when parent comment does not exist", async () => {
        vi.mocked(txPostRepo.findById).mockResolvedValue(buildPost());
        vi.mocked(txCommentRepo.findById).mockResolvedValue(null);

        await expect(
            useCase.execute({
                content: "Reply",
                target: { type: "POST" as const, id: "post-1" },
                authorId: "user-1",
                parentId: "parent-1",
            }),
        ).rejects.toThrow(NotFoundError);
    });

    it("should throw BadRequestError when parent comment belongs to a different post", async () => {
        vi.mocked(txPostRepo.findById).mockResolvedValue(buildPost());
        vi.mocked(txCommentRepo.findById).mockResolvedValue(
            buildComment({ id: "parent-1", postId: "other-post" }),
        );

        await expect(
            useCase.execute({
                content: "Reply",
                target: { type: "POST" as const, id: "post-1" },
                authorId: "user-1",
                parentId: "parent-1",
            }),
        ).rejects.toThrow(BadRequestError);
    });

    it("should create top-level comment and notify post author when commenter is not the author", async () => {
        const savedComment = buildComment({ id: "new-comment-1" });
        vi.mocked(txPostRepo.findById).mockResolvedValue(buildPost("author-1"));
        vi.mocked(txCommentRepo.create).mockResolvedValue(savedComment);
        vi.mocked(txPostRepo.incrementCommentsCount).mockResolvedValue(
            undefined,
        );

        const result = await useCase.execute({
            content: "Hello",
            target: { type: "POST" as const, id: "post-1" },
            authorId: "commenter-user",
        });

        expect(result).toBe(savedComment);
        expect(txPostRepo.incrementCommentsCount).toHaveBeenCalledWith(
            "post-1",
        );
        expect(txNotificationRepo.create).toHaveBeenCalledOnce();
        expect(realtimeSvc.emitToUser).toHaveBeenCalledWith(
            "author-1",
            "new-notification",
            expect.objectContaining({ type: "COMMENT" }),
        );

        const [notification] = vi.mocked(txNotificationRepo.create).mock
            .calls[0];
        expect(notification.commentId).toBe("new-comment-1");
        expect(notification.postId).toBe("post-1");
        expect(notification.referenceId).toBe("new-comment-1");
        expect(notification.articleId).toBeUndefined();
    });

    it("should not send notification when commenter is the post author", async () => {
        const savedComment = buildComment({ id: "new-comment-1" });
        vi.mocked(txPostRepo.findById).mockResolvedValue(buildPost("user-1"));
        vi.mocked(txCommentRepo.create).mockResolvedValue(savedComment);
        vi.mocked(txPostRepo.incrementCommentsCount).mockResolvedValue(
            undefined,
        );

        await useCase.execute({
            content: "My own post comment",
            target: { type: "POST" as const, id: "post-1" },
            authorId: "user-1",
        });

        expect(txNotificationRepo.create).not.toHaveBeenCalled();
        expect(realtimeSvc.emitToUser).not.toHaveBeenCalled();
    });

    it("should create reply, increment repliesCount and notify parent comment author", async () => {
        const parentComment = buildComment({
            id: "parent-1",
            target: { type: "POST" as const, id: "post-1" },
            authorId: "parent-author",
        });
        const savedComment = buildComment({ id: "reply-1" });

        vi.mocked(txPostRepo.findById).mockResolvedValue(buildPost("author-1"));
        vi.mocked(txCommentRepo.findById).mockResolvedValue(parentComment);
        vi.mocked(txCommentRepo.create).mockResolvedValue(savedComment);
        vi.mocked(txPostRepo.incrementCommentsCount).mockResolvedValue(
            undefined,
        );
        vi.mocked(txCommentRepo.incrementRepliesCount).mockResolvedValue(
            undefined,
        );

        await useCase.execute({
            content: "Reply",
            target: { type: "POST" as const, id: "post-1" },
            authorId: "user-1",
            parentId: "parent-1",
        });

        expect(txCommentRepo.incrementRepliesCount).toHaveBeenCalledWith(
            "parent-1",
        );
        expect(txNotificationRepo.create).toHaveBeenCalledOnce();
        expect(realtimeSvc.emitToUser).toHaveBeenCalledWith(
            "parent-author",
            "new-notification",
            expect.objectContaining({ type: "COMMENT" }),
        );
    });

    it("should not send notification when replying to own comment", async () => {
        const parentComment = buildComment({
            id: "parent-1",
            target: { type: "POST" as const, id: "post-1" },
            authorId: "user-1",
        });
        const savedComment = buildComment({ id: "reply-1" });

        vi.mocked(txPostRepo.findById).mockResolvedValue(buildPost("author-1"));
        vi.mocked(txCommentRepo.findById).mockResolvedValue(parentComment);
        vi.mocked(txCommentRepo.create).mockResolvedValue(savedComment);
        vi.mocked(txPostRepo.incrementCommentsCount).mockResolvedValue(
            undefined,
        );
        vi.mocked(txCommentRepo.incrementRepliesCount).mockResolvedValue(
            undefined,
        );

        await useCase.execute({
            content: "Self reply",
            target: { type: "POST" as const, id: "post-1" },
            authorId: "user-1",
            parentId: "parent-1",
        });

        expect(txNotificationRepo.create).not.toHaveBeenCalled();
        expect(realtimeSvc.emitToUser).not.toHaveBeenCalled();
    });
    describe("mentions", () => {
        it("should resolve the handles in the content onto the comment", async () => {
            vi.mocked(txPostRepo.findById).mockResolvedValue(buildPost());
            vi.mocked(txCommentRepo.create).mockResolvedValue(
                buildComment({ id: "comment-1" }),
            );
            vi.mocked(userRepo.findManyByUsernames).mockResolvedValue([
                { id: "user-2", username: "ada" },
            ]);

            await useCase.execute({
                content: "good point @ada",
                target: { type: "POST" as const, id: "post-1" },
                authorId: "user-1",
            });

            expect(userRepo.findManyByUsernames).toHaveBeenCalledWith(["ada"]);
            const stored = vi.mocked(txCommentRepo.create).mock
                .calls[0][0] as Comment;
            expect(stored.mentions).toEqual([
                { id: "user-2", username: "ada" },
            ]);
        });

        it("should notify the resolved users with the comment as the target", async () => {
            vi.mocked(txPostRepo.findById).mockResolvedValue(
                buildPost("user-1"),
            );
            vi.mocked(txCommentRepo.create).mockResolvedValue(
                buildComment({ id: "comment-1" }),
            );
            vi.mocked(userRepo.findManyByUsernames).mockResolvedValue([
                { id: "user-2", username: "ada" },
            ]);

            await useCase.execute({
                content: "hey @ada",
                target: { type: "POST" as const, id: "post-1" },
                authorId: "user-1",
            });

            await vi.waitFor(() => {
                expect(
                    notifyMentionedUsersUseCase.execute,
                ).toHaveBeenCalledWith({
                    issuerId: "user-1",
                    mentionedUserIds: ["user-2"],
                    target: { commentId: "comment-1", postId: "post-1" },
                    articleSlug: undefined,
                    excludeUserIds: [],
                });
            });
        });

        it("should leave out the post author, who already gets a COMMENT", async () => {
            vi.mocked(txPostRepo.findById).mockResolvedValue(
                buildPost("author-1"),
            );
            vi.mocked(txCommentRepo.create).mockResolvedValue(
                buildComment({ id: "comment-1" }),
            );
            vi.mocked(userRepo.findManyByUsernames).mockResolvedValue([
                { id: "author-1", username: "ada" },
            ]);

            await useCase.execute({
                content: "thanks @ada",
                target: { type: "POST" as const, id: "post-1" },
                authorId: "user-1",
            });

            await vi.waitFor(() => {
                expect(
                    notifyMentionedUsersUseCase.execute,
                ).toHaveBeenCalledWith(
                    expect.objectContaining({ excludeUserIds: ["author-1"] }),
                );
            });
        });

        it("should not notify anyone when the content names nobody", async () => {
            vi.mocked(txPostRepo.findById).mockResolvedValue(buildPost());
            vi.mocked(txCommentRepo.create).mockResolvedValue(buildComment());

            await useCase.execute({
                content: "no handles here",
                target: { type: "POST" as const, id: "post-1" },
                authorId: "user-1",
            });

            expect(userRepo.findManyByUsernames).not.toHaveBeenCalled();
            expect(notifyMentionedUsersUseCase.execute).not.toHaveBeenCalled();
        });
    });
});
