import { beforeEach, describe, expect, it, vi } from "vitest";
import { LikePostUseCase } from "@core/use-cases/post/like-post";
import type {
    TransactionPort,
    TransactionContext,
} from "@core/ports/services/transaction.port";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import { NotFoundError } from "@core/errors";
import { NotificationType } from "@core/domain/enums/notification-type.enum";
import { buildPost } from "../../../helpers/mock-factories";

describe("LikePostUseCase", () => {
    let useCase: LikePostUseCase;
    let transactionService: Pick<TransactionPort, "runInTransaction">;
    let realtimeService: Pick<RealtimePort, "emitToUser">;
    let mockCtx: Pick<
        TransactionContext,
        "postRepository" | "postLikeRepository" | "notificationRepository"
    >;

    beforeEach(() => {
        mockCtx = {
            postRepository: {
                findById: vi.fn(),
            } as unknown as TransactionContext["postRepository"],
            postLikeRepository: {
                isLiked: vi.fn().mockResolvedValue(false),
                like: vi.fn().mockResolvedValue(undefined),
                incrementLikeCount: vi.fn().mockResolvedValue(undefined),
            } as unknown as TransactionContext["postLikeRepository"],
            notificationRepository: {
                create: vi.fn().mockResolvedValue(undefined),
            } as unknown as TransactionContext["notificationRepository"],
        };
        transactionService = {
            runInTransaction: vi
                .fn()
                .mockImplementation(async (work) =>
                    work(mockCtx as TransactionContext),
                ),
        };
        realtimeService = {
            emitToUser: vi.fn(),
        };
        useCase = new LikePostUseCase(
            transactionService as TransactionPort,
            realtimeService as RealtimePort,
        );
    });

    it("should throw NotFoundError when post not found inside transaction", async () => {
        vi.mocked(mockCtx.postRepository.findById).mockResolvedValue(null);

        await expect(
            useCase.execute({ postId: "ghost-post", userId: "user-1" }),
        ).rejects.toThrow(NotFoundError);
    });

    it("should return early when post is already liked (idempotent)", async () => {
        vi.mocked(mockCtx.postRepository.findById).mockResolvedValue(
            buildPost({ author: { id: "author-1" } }),
        );
        vi.mocked(mockCtx.postLikeRepository.isLiked).mockResolvedValue(true);

        await useCase.execute({ postId: "post-1", userId: "user-1" });

        expect(mockCtx.postLikeRepository.like).not.toHaveBeenCalled();
        expect(
            mockCtx.postLikeRepository.incrementLikeCount,
        ).not.toHaveBeenCalled();
    });

    it("should like post and increment like count", async () => {
        vi.mocked(mockCtx.postRepository.findById).mockResolvedValue(
            buildPost({ author: { id: "author-1" } }),
        );

        await useCase.execute({ postId: "post-1", userId: "user-1" });

        expect(mockCtx.postLikeRepository.like).toHaveBeenCalledWith(
            "post-1",
            "user-1",
        );
        expect(
            mockCtx.postLikeRepository.incrementLikeCount,
        ).toHaveBeenCalledWith("post-1");
    });

    it("should create notification and emit realtime event when liker is not author", async () => {
        vi.mocked(mockCtx.postRepository.findById).mockResolvedValue(
            buildPost({ id: "post-1", author: { id: "author-1" } }),
        );

        await useCase.execute({ postId: "post-1", userId: "liker-99" });

        expect(mockCtx.notificationRepository.create).toHaveBeenCalledOnce();
        expect(realtimeService.emitToUser).toHaveBeenCalledWith(
            "author-1",
            "new-notification",
            expect.objectContaining({
                type: NotificationType.LIKE,
                issuerId: "liker-99",
                postId: "post-1",
            }),
        );
    });

    it("should persist the liked post on the notification so it can be opened", async () => {
        vi.mocked(mockCtx.postRepository.findById).mockResolvedValue(
            buildPost({ id: "post-1", author: { id: "author-1" } }),
        );

        await useCase.execute({ postId: "post-1", userId: "liker-99" });

        const [notification] = vi.mocked(mockCtx.notificationRepository.create)
            .mock.calls[0];
        expect(notification.postId).toBe("post-1");
        expect(notification.referenceId).toBe("post-1");
        expect(notification.articleId).toBeUndefined();
        expect(notification.commentId).toBeUndefined();
    });

    it("should not create notification when user likes their own post", async () => {
        vi.mocked(mockCtx.postRepository.findById).mockResolvedValue(
            buildPost({ author: { id: "user-1" } }),
        );

        await useCase.execute({ postId: "post-1", userId: "user-1" });

        expect(mockCtx.notificationRepository.create).not.toHaveBeenCalled();
        expect(realtimeService.emitToUser).not.toHaveBeenCalled();
    });
});
