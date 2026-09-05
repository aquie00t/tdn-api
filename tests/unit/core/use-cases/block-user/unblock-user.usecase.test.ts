import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnblockUserUseCase } from "@core/use-cases/block-user/unblock-user";
import type { IBlockRepository } from "@core/ports/repositories/block.repository";
import { BadRequestError } from "@core/errors";
import { buildBlockRepository } from "../../../helpers/mock-factories";

const BLOCKER = "user-1";
const TARGET = "user-2";

describe("UnblockUserUseCase", () => {
    let useCase: UnblockUserUseCase;
    let blockRepository: IBlockRepository;

    beforeEach(() => {
        blockRepository = buildBlockRepository();
        useCase = new UnblockUserUseCase(blockRepository);
    });

    it("should throw BadRequestError when a user targets themselves", async () => {
        await expect(
            useCase.execute({ currentUserId: BLOCKER, targetId: BLOCKER }),
        ).rejects.toThrow(BadRequestError);

        expect(blockRepository.unblock).not.toHaveBeenCalled();
    });

    it("should lift only this user's own block", async () => {
        const result = await useCase.execute({
            currentUserId: BLOCKER,
            targetId: TARGET,
        });

        expect(result).toEqual({ isBlocked: false, removed: true });
        expect(blockRepository.unblock).toHaveBeenCalledWith(BLOCKER, TARGET);
    });

    it("should succeed quietly when there was nothing to lift", async () => {
        vi.mocked(blockRepository.unblock).mockResolvedValue(false);

        const result = await useCase.execute({
            currentUserId: BLOCKER,
            targetId: TARGET,
        });

        expect(result).toEqual({ isBlocked: false, removed: false });
    });

    it("should not look the target up", async () => {
        await useCase.execute({ currentUserId: BLOCKER, targetId: TARGET });

        // A block can outlive the account it names; refusing to clear one
        // because the user is gone would leave a row nobody can remove.
        expect(blockRepository.unblock).toHaveBeenCalledOnce();
    });
});
