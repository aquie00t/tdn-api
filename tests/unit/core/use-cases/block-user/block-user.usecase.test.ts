import { beforeEach, describe, expect, it, vi } from "vitest";
import { BlockUserUseCase } from "@core/use-cases/block-user/block-user";
import type {
    TransactionContext,
    TransactionPort,
} from "@core/ports/services/transaction.port";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import { BadRequestError, NotFoundError } from "@core/errors";
import {
    buildBlockRepository,
    buildUser,
} from "../../../helpers/mock-factories";

const BLOCKER = "user-1";
const TARGET = "user-2";

describe("BlockUserUseCase", () => {
    let useCase: BlockUserUseCase;
    let transactionService: Pick<TransactionPort, "runInTransaction">;
    let userRepository: Pick<IUserRepository, "findById">;
    let followRepo: Pick<IFollowRepository, "unfollowUser">;
    let ctx: Pick<
        TransactionContext,
        "blockRepository" | "followUserRepository"
    >;

    beforeEach(() => {
        followRepo = { unfollowUser: vi.fn().mockResolvedValue(true) };

        ctx = {
            blockRepository: buildBlockRepository(),
            followUserRepository: followRepo as IFollowRepository,
        };

        transactionService = {
            runInTransaction: vi
                .fn()
                .mockImplementation(async (work) =>
                    work(ctx as TransactionContext),
                ),
        };

        userRepository = {
            findById: vi.fn().mockResolvedValue(buildUser({ id: TARGET })),
        };

        useCase = new BlockUserUseCase(
            transactionService as TransactionPort,
            userRepository as IUserRepository,
        );
    });

    it("should throw BadRequestError when a user blocks themselves", async () => {
        await expect(
            useCase.execute({ currentUserId: BLOCKER, targetId: BLOCKER }),
        ).rejects.toThrow(BadRequestError);

        expect(transactionService.runInTransaction).not.toHaveBeenCalled();
    });

    it("should throw NotFoundError when the target does not exist", async () => {
        vi.mocked(userRepository.findById).mockResolvedValue(null);

        await expect(
            useCase.execute({ currentUserId: BLOCKER, targetId: TARGET }),
        ).rejects.toThrow(NotFoundError);
    });

    it("should throw NotFoundError when the target is being deleted", async () => {
        vi.mocked(userRepository.findById).mockResolvedValue(
            buildUser({ id: TARGET, deletedAt: new Date() }),
        );

        await expect(
            useCase.execute({ currentUserId: BLOCKER, targetId: TARGET }),
        ).rejects.toThrow(NotFoundError);
    });

    it("should write the block and tear down the follow in both directions", async () => {
        const result = await useCase.execute({
            currentUserId: BLOCKER,
            targetId: TARGET,
        });

        expect(result).toEqual({ isBlocked: true, created: true });
        expect(ctx.blockRepository.block).toHaveBeenCalledWith(BLOCKER, TARGET);

        // Both ways: the feature is symmetric, and leaving either follow
        // standing would restore the relationship when the block is lifted.
        expect(followRepo.unfollowUser).toHaveBeenCalledWith(BLOCKER, TARGET);
        expect(followRepo.unfollowUser).toHaveBeenCalledWith(TARGET, BLOCKER);
    });

    it("should keep the block and the unfollows in one transaction", async () => {
        await useCase.execute({ currentUserId: BLOCKER, targetId: TARGET });

        // A block committed on its own would leave the two accounts following
        // each other while invisible to each other.
        expect(transactionService.runInTransaction).toHaveBeenCalledOnce();
    });

    it("should report created false when the block was already there", async () => {
        vi.mocked(ctx.blockRepository.block).mockResolvedValue(false);

        const result = await useCase.execute({
            currentUserId: BLOCKER,
            targetId: TARGET,
        });

        expect(result).toEqual({ isBlocked: true, created: false });
    });

    it("should still drop the follows when the block already existed", async () => {
        vi.mocked(ctx.blockRepository.block).mockResolvedValue(false);

        await useCase.execute({ currentUserId: BLOCKER, targetId: TARGET });

        // An earlier call that failed partway has to converge on the same
        // state, so the unfollows are not conditional on the insert.
        expect(followRepo.unfollowUser).toHaveBeenCalledTimes(2);
    });
});
