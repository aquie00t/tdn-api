import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetBotProfilesUseCase } from "@core/use-cases/profile/get-bot-profiles";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import { PostCategory } from "@core/domain/enums/post-category-enum";
import { buildProfile } from "../../../helpers/mock-factories";

describe("GetBotProfilesUseCase", () => {
    let useCase: GetBotProfilesUseCase;
    let profileRepository: Pick<IProfileRepository, "findBotProfiles">;
    let followUserRepository: Pick<IFollowRepository, "checkIsFollowingBulk">;

    beforeEach(() => {
        profileRepository = {
            findBotProfiles: vi.fn().mockResolvedValue([]),
        };
        followUserRepository = {
            checkIsFollowingBulk: vi.fn().mockResolvedValue([]),
        };
        useCase = new GetBotProfilesUseCase(
            profileRepository as IProfileRepository,
            followUserRepository as IFollowRepository,
        );
    });

    it("should return an empty array when no bots match", async () => {
        const result = await useCase.execute({
            categories: [PostCategory.BACKEND],
        });

        expect(result).toEqual([]);
        expect(
            followUserRepository.checkIsFollowingBulk,
        ).not.toHaveBeenCalled();
    });

    it("should forward categories and pagination to the repository", async () => {
        await useCase.execute({
            categories: [PostCategory.BACKEND, PostCategory.FRONTEND],
            limit: 5,
            offset: 10,
        });

        expect(profileRepository.findBotProfiles).toHaveBeenCalledWith(
            [PostCategory.BACKEND, PostCategory.FRONTEND],
            5,
            10,
        );
    });

    it("should apply default pagination when it is omitted", async () => {
        await useCase.execute({});

        expect(profileRepository.findBotProfiles).toHaveBeenCalledWith(
            undefined,
            20,
            0,
        );
    });

    it("should map profiles to bot items with categories", async () => {
        vi.mocked(profileRepository.findBotProfiles).mockResolvedValue([
            buildProfile({
                userId: "bot-1",
                username: "tsbot",
                fullName: "TypeScript Bot",
                bio: "TS news",
                categories: [PostCategory.BACKEND],
                followersCount: 42,
            }),
        ]);

        const result = await useCase.execute({});

        expect(result).toEqual([
            {
                userId: "bot-1",
                username: "tsbot",
                fullName: "TypeScript Bot",
                avatarUrl: "https://example.com/avatar.png",
                isVerified: false,
                bannerUrl: "https://example.com/banner.png",
                bio: "TS news",
                categories: [PostCategory.BACKEND],
                followersCount: 42,
                isFollowing: false,
            },
        ]);
    });

    it("should flag bots the current user already follows", async () => {
        vi.mocked(profileRepository.findBotProfiles).mockResolvedValue([
            buildProfile({ userId: "bot-1" }),
            buildProfile({ userId: "bot-2" }),
        ]);
        vi.mocked(followUserRepository.checkIsFollowingBulk).mockResolvedValue([
            "bot-2",
        ]);

        const result = await useCase.execute({ currentUserId: "user-1" });

        expect(followUserRepository.checkIsFollowingBulk).toHaveBeenCalledWith(
            "user-1",
            ["bot-1", "bot-2"],
        );
        expect(result.map((item) => item.isFollowing)).toEqual([false, true]);
    });

    it("should skip the follow lookup for anonymous callers", async () => {
        vi.mocked(profileRepository.findBotProfiles).mockResolvedValue([
            buildProfile({ userId: "bot-1" }),
        ]);

        const result = await useCase.execute({});

        expect(
            followUserRepository.checkIsFollowingBulk,
        ).not.toHaveBeenCalled();
        expect(result[0].isFollowing).toBe(false);
    });
});
