import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnlikePostUseCase } from "@core/use-cases/post/unlike-post";
import type {
    TransactionPort,
    TransactionContext,
} from "@core/ports/services/transaction.port";
import { NotFoundError } from "@core/errors";
import { buildPost } from "../../../helpers/mock-factories";
import { NotificationType } from "@core/domain/enums/notification-type.enum";

describe("UnlikePostUseCase", () => {
    let useCase: UnlikePostUseCase;
    let transactionService: Pick<TransactionPort, "runInTransaction">;
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
                isLiked: vi.fn().mockResolvedValue(true),
                unlike: vi.fn().mockResolvedValue(undefined),
                decrementLikeCount: vi.fn().mockResolvedValue(undefined),
            } as unknown as TransactionContext["postLikeRepository"],
            notificationRepository: {
                deleteByTarget: vi.fn().mockResolvedValue(1),
            } as unknown as TransactionContext["notificationRepository"],
        };
        transactionService = {
            runInTransaction: vi
                .fn()
                .mockImplementation(async (work) =>
                    work(mockCtx as TransactionContext),
                ),
        };
        useCase = new UnlikePostUseCase(transactionService as TransactionPort);
    });

    it("should throw NotFoundError when post not found", async () => {
        vi.mocked(mockCtx.postRepository.findById).mockResolvedValue(null);

        await expect(
            useCase.execute({ postId: "ghost-post", userId: "user-1" }),
        ).rejects.toThrow(NotFoundError);
    });

    it("should unlike post and decrement like count when liked", async () => {
        vi.mocked(mockCtx.postRepository.findById).mockResolvedValue(
            buildPost(),
        );
        vi.mocked(mockCtx.postLikeRepository.isLiked).mockResolvedValue(true);

        await useCase.execute({ postId: "post-1", userId: "user-1" });

        expect(mockCtx.postLikeRepository.unlike).toHaveBeenCalledWith(
            "post-1",
            "user-1",
        );
        expect(
            mockCtx.postLikeRepository.decrementLikeCount,
        ).toHaveBeenCalledWith("post-1");
    });

    it("should do nothing when post is not liked (idempotent)", async () => {
        vi.mocked(mockCtx.postRepository.findById).mockResolvedValue(
            buildPost(),
        );
        vi.mocked(mockCtx.postLikeRepository.isLiked).mockResolvedValue(false);

        await useCase.execute({ postId: "post-1", userId: "user-1" });

        expect(mockCtx.postLikeRepository.unlike).not.toHaveBeenCalled();
        expect(
            mockCtx.postLikeRepository.decrementLikeCount,
        ).not.toHaveBeenCalled();
    });

    it("should propagate transaction errors", async () => {
        vi.mocked(transactionService.runInTransaction).mockRejectedValue(
            new Error("Transaction failed"),
        );

        await expect(
            useCase.execute({ postId: "post-1", userId: "user-1" }),
        ).rejects.toThrow("Transaction failed");
    });

    it("should take back the notification the like had produced", async () => {
        vi.mocked(mockCtx.postRepository.findById).mockResolvedValue(
            buildPost({ id: "post-1", author: { id: "author-1" } }),
        );
        vi.mocked(mockCtx.postLikeRepository.isLiked).mockResolvedValue(true);

        await useCase.execute({ postId: "post-1", userId: "liker-99" });

        expect(
            mockCtx.notificationRepository.deleteByTarget,
        ).toHaveBeenCalledWith({
            recipientId: "author-1",
            issuerId: "liker-99",
            type: NotificationType.LIKE,
            postId: "post-1",
        });
    });

    it("should not touch notifications when there was no like to undo", async () => {
        vi.mocked(mockCtx.postRepository.findById).mockResolvedValue(
            buildPost({ id: "post-1", author: { id: "author-1" } }),
        );
        vi.mocked(mockCtx.postLikeRepository.isLiked).mockResolvedValue(false);

        await useCase.execute({ postId: "post-1", userId: "liker-99" });

        expect(
            mockCtx.notificationRepository.deleteByTarget,
        ).not.toHaveBeenCalled();
    });
});
