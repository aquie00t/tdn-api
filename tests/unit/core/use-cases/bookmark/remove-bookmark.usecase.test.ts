import { beforeEach, describe, expect, it, vi } from "vitest";
import { RemoveBookmarkUseCase } from "@core/use-cases/bookmark/remove-bookmark/remove-bookmark.usecase";
import { NotFoundError } from "@core/errors";
import type {
    TransactionPort,
    TransactionContext,
} from "@core/ports/services/transaction.port";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { IBookmarkRepository } from "@core/ports/repositories/bookmark.repository";
import type { Post } from "@core/domain/entities/post.entity";

describe("RemoveBookmarkUseCase", () => {
    let useCase: RemoveBookmarkUseCase;
    let transactionSvc: Pick<TransactionPort, "runInTransaction">;
    let txPostRepo: Pick<IPostRepository, "findById">;
    let txBookmarkRepo: Pick<IBookmarkRepository, "isBookmarked" | "remove">;

    const input = { postId: "post-1", userId: "user-1" };

    const buildTransactionContext = (): TransactionContext =>
        ({
            postRepository: txPostRepo as IPostRepository,
            bookmarkRepository: txBookmarkRepo as IBookmarkRepository,
        }) as TransactionContext;

    beforeEach(() => {
        txPostRepo = { findById: vi.fn() };
        txBookmarkRepo = { isBookmarked: vi.fn(), remove: vi.fn() };
        transactionSvc = { runInTransaction: vi.fn() };

        vi.mocked(transactionSvc.runInTransaction).mockImplementation(
            async (work) => work(buildTransactionContext()),
        );

        useCase = new RemoveBookmarkUseCase(transactionSvc as TransactionPort);
    });

    it("should throw NotFoundError when post does not exist", async () => {
        vi.mocked(txPostRepo.findById).mockResolvedValue(null);

        await expect(useCase.execute(input)).rejects.toThrow(NotFoundError);
        expect(txBookmarkRepo.remove).not.toHaveBeenCalled();
    });

    it("should not remove when post is not bookmarked", async () => {
        vi.mocked(txPostRepo.findById).mockResolvedValue({} as Post);
        vi.mocked(txBookmarkRepo.isBookmarked).mockResolvedValue(false);

        await useCase.execute(input);

        expect(txBookmarkRepo.remove).not.toHaveBeenCalled();
    });

    it("should remove bookmark when post is bookmarked", async () => {
        vi.mocked(txPostRepo.findById).mockResolvedValue({} as Post);
        vi.mocked(txBookmarkRepo.isBookmarked).mockResolvedValue(true);
        vi.mocked(txBookmarkRepo.remove).mockResolvedValue();

        await useCase.execute(input);

        expect(txBookmarkRepo.remove).toHaveBeenCalledWith(
            input.postId,
            input.userId,
        );
    });
});
