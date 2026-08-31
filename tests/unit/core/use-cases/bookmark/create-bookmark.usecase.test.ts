import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateBookmarkUseCase } from "@core/use-cases/bookmark/create-bookmark/create-bookmark.usecase";
import { NotFoundError } from "@core/errors";
import type {
    TransactionPort,
    TransactionContext,
} from "@core/ports/services/transaction.port";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { IBookmarkRepository } from "@core/ports/repositories/bookmark.repository";
import type { Post } from "@core/domain/entities/post.entity";

describe("CreateBookmarkUseCase", () => {
    let useCase: CreateBookmarkUseCase;
    let transactionSvc: Pick<TransactionPort, "runInTransaction">;
    let txPostRepo: Pick<IPostRepository, "findById">;
    let txBookmarkRepo: Pick<IBookmarkRepository, "isBookmarked" | "save">;

    const input = { postId: "post-1", userId: "user-1" };

    const buildTransactionContext = (): TransactionContext =>
        ({
            postRepository: txPostRepo as IPostRepository,
            bookmarkRepository: txBookmarkRepo as IBookmarkRepository,
        }) as TransactionContext;

    beforeEach(() => {
        txPostRepo = { findById: vi.fn() };
        txBookmarkRepo = {
            isBookmarked: vi.fn(),
            save: vi.fn(),
        };
        transactionSvc = { runInTransaction: vi.fn() };

        vi.mocked(transactionSvc.runInTransaction).mockImplementation(
            async (work) => work(buildTransactionContext()),
        );

        useCase = new CreateBookmarkUseCase(transactionSvc as TransactionPort);
    });

    it("should throw NotFoundError when post does not exist", async () => {
        vi.mocked(txPostRepo.findById).mockResolvedValue(null);

        await expect(useCase.execute(input)).rejects.toThrow(NotFoundError);
        expect(txBookmarkRepo.save).not.toHaveBeenCalled();
    });

    it("should not save bookmark when post is already bookmarked", async () => {
        vi.mocked(txPostRepo.findById).mockResolvedValue({} as Post);
        vi.mocked(txBookmarkRepo.isBookmarked).mockResolvedValue(true);

        await useCase.execute(input);

        expect(txBookmarkRepo.save).not.toHaveBeenCalled();
    });

    it("should save bookmark when post exists and is not bookmarked", async () => {
        vi.mocked(txPostRepo.findById).mockResolvedValue({} as Post);
        vi.mocked(txBookmarkRepo.isBookmarked).mockResolvedValue(false);
        vi.mocked(txBookmarkRepo.save).mockResolvedValue();

        await useCase.execute(input);

        expect(txBookmarkRepo.save).toHaveBeenCalledWith(
            input.postId,
            input.userId,
        );
    });
});
