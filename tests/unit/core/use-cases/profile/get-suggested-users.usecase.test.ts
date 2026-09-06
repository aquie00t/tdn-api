import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetSuggestedUsersUseCase } from "@core/use-cases/profile/get-suggested-users";
import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import { buildProfile } from "../../../helpers/mock-factories";

describe("GetSuggestedUsersUseCase", () => {
    let useCase: GetSuggestedUsersUseCase;
    let profileRepository: Pick<IProfileRepository, "getSuggestedUsers">;

    beforeEach(() => {
        profileRepository = {
            getSuggestedUsers: vi.fn().mockResolvedValue([]),
        };
        useCase = new GetSuggestedUsersUseCase(
            profileRepository as IProfileRepository,
        );
    });

    it("should return empty array when no profiles are found", async () => {
        const result = await useCase.execute({ currentUserId: "user-1" });

        expect(result).toEqual([]);
    });

    it("should use default limit of 10 when limit is not provided", async () => {
        await useCase.execute({ currentUserId: "user-1" });

        expect(profileRepository.getSuggestedUsers).toHaveBeenCalledWith(
            "user-1",
            10,
        );
    });

    it("should use the provided limit", async () => {
        await useCase.execute({ currentUserId: "user-1", limit: 5 });

        expect(profileRepository.getSuggestedUsers).toHaveBeenCalledWith(
            "user-1",
            5,
        );
    });

    it("should pass null when currentUserId is not provided", async () => {
        await useCase.execute({});

        expect(profileRepository.getSuggestedUsers).toHaveBeenCalledWith(
            null,
            10,
        );
    });

    it("should map profiles to SuggestedUserItem with fixed isFollowing and isMe values", async () => {
        const profile = buildProfile({
            userId: "user-2",
            username: "suggested",
            fullName: "Suggested User",
            avatarUrl: "https://example.com/avatar.png",
            bannerUrl: "https://example.com/banner.png",
            bio: "Bio text",
            followersCount: 42,
        });
        vi.mocked(profileRepository.getSuggestedUsers).mockResolvedValue([
            profile,
        ]);

        const result = await useCase.execute({ currentUserId: "user-1" });

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            userId: profile.userId,
            username: profile.username,
            fullName: profile.fullName,
            avatarUrl: profile.avatarUrl,
            isVerified: false,
            bannerUrl: profile.bannerUrl,
            bio: profile.bio,
            followersCount: profile.followersCount,
            isFollowing: false,
            isMe: false,
        });
    });

    it("should always set isFollowing and isMe to false regardless of input", async () => {
        const profiles = [
            buildProfile({ userId: "user-1" }),
            buildProfile({ userId: "user-2" }),
        ];
        vi.mocked(profileRepository.getSuggestedUsers).mockResolvedValue(
            profiles,
        );

        const result = await useCase.execute({ currentUserId: "user-1" });

        for (const item of result) {
            expect(item.isFollowing).toBe(false);
            expect(item.isMe).toBe(false);
        }
    });
});
