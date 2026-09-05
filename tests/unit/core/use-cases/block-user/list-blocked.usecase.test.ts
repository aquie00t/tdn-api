import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListBlockedUseCase } from "@core/use-cases/block-user/list-blocked";
import type { IBlockRepository } from "@core/ports/repositories/block.repository";
import { buildBlockRepository } from "../../../helpers/mock-factories";

const VIEWER = "user-1";

describe("ListBlockedUseCase", () => {
    let useCase: ListBlockedUseCase;
    let blockRepository: IBlockRepository;

    beforeEach(() => {
        blockRepository = buildBlockRepository();
        useCase = new ListBlockedUseCase(blockRepository);
    });

    it("should return the page and the total", async () => {
        const users = [
            {
                userId: "user-2",
                username: "blocked",
                fullName: "Blocked User",
                avatarUrl: "avatar.png",
                bio: null,
            },
        ];

        vi.mocked(blockRepository.listBlocked).mockResolvedValue(users);
        vi.mocked(blockRepository.countBlocked).mockResolvedValue(7);

        const result = await useCase.execute({
            currentUserId: VIEWER,
            limit: 20,
            offset: 0,
        });

        expect(result).toEqual({ users, total: 7 });
    });

    it("should pass the pagination through to the repository", async () => {
        await useCase.execute({
            currentUserId: VIEWER,
            limit: 10,
            offset: 30,
        });

        expect(blockRepository.listBlocked).toHaveBeenCalledWith(
            VIEWER,
            10,
            30,
        );
    });

    it("should only ever list the caller's own blocks", async () => {
        await useCase.execute({
            currentUserId: VIEWER,
            limit: 20,
            offset: 0,
        });

        // The accounts that blocked *them* are not theirs to manage, and
        // listing those would hand out a mirror of who dislikes them.
        expect(blockRepository.listBlocked).toHaveBeenCalledWith(
            VIEWER,
            expect.any(Number),
            expect.any(Number),
        );
        expect(blockRepository.countBlocked).toHaveBeenCalledWith(VIEWER);
    });
});
