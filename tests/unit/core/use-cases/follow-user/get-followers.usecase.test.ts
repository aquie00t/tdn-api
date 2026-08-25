import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetFollowersUseCase } from "@core/use-cases/follow-user/get-followers/get-followers.usecase";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import { NotFoundError } from "@core/errors";
import { buildProfile } from "../../../helpers/mock-factories";

const buildFollowerEntry = (userId: string) => ({
    userId,
    username: `user_${userId}`,
    fullName: `User ${userId}`,
    avatarUrl: "https://example.com/avatar.png",
    bio: null,
});

describe("GetFollowersUseCase", () => {
    let useCase: GetFollowersUseCase;
    let followRepo: Pick<
        IFollowRepository,
        "getFollowers" | "checkIsFollowingBulk"
    >;
    let profileRepo: Pick<IProfileRepository, "findByUsername">;

    const baseInput = {
        username: "testuser",
        limit: 10,
        offset: 0,
        currentUserId: undefined,
    };

    beforeEach(() => {
        followRepo = {
            getFollowers: vi.fn(),
            checkIsFollowingBulk: vi.fn(),
        };
        profileRepo = {
            findByUsername: vi
                .fn()
                .mockResolvedValue(buildProfile({ userId: "user-1" })),
        };
        useCase = new GetFollowersUseCase(
            followRepo as IFollowRepository,
            profileRepo as IProfileRepository,
        );
    });

    it("should return empty array when user has no followers", async () => {
        vi.mocked(followRepo.getFollowers).mockResolvedValue([]);

        const result = await useCase.execute(baseInput);

        expect(result).toEqual([]);
        expect(followRepo.checkIsFollowingBulk).not.toHaveBeenCalled();
    });

    it("should return followers with isFollowing=false and isMe=false when no currentUserId", async () => {
        vi.mocked(followRepo.getFollowers).mockResolvedValue([
            buildFollowerEntry("user-2"),
            buildFollowerEntry("user-3"),
        ]);

        const result = await useCase.execute(baseInput);

        expect(result).toHaveLength(2);
        expect(result[0].isFollowing).toBe(false);
        expect(result[0].isMe).toBe(false);
        expect(followRepo.checkIsFollowingBulk).not.toHaveBeenCalled();
    });

    it("should mark isFollowing=true for users the currentUser follows", async () => {
        vi.mocked(followRepo.getFollowers).mockResolvedValue([
            buildFollowerEntry("user-2"),
            buildFollowerEntry("user-3"),
        ]);
        vi.mocked(followRepo.checkIsFollowingBulk).mockResolvedValue([
            "user-2",
        ]);

        const result = await useCase.execute({
            ...baseInput,
            currentUserId: "user-1",
        });

        expect(followRepo.checkIsFollowingBulk).toHaveBeenCalledWith("user-1", [
            "user-2",
            "user-3",
        ]);
        const user2 = result.find((r) => r.userId === "user-2");
        const user3 = result.find((r) => r.userId === "user-3");
        expect(user2?.isFollowing).toBe(true);
        expect(user3?.isFollowing).toBe(false);
    });

    it("should mark isMe=true when a follower is the currentUser", async () => {
        vi.mocked(followRepo.getFollowers).mockResolvedValue([
            buildFollowerEntry("user-1"),
            buildFollowerEntry("user-2"),
        ]);
        vi.mocked(followRepo.checkIsFollowingBulk).mockResolvedValue([]);

        const result = await useCase.execute({
            ...baseInput,
            currentUserId: "user-1",
        });

        const me = result.find((r) => r.userId === "user-1");
        const other = result.find((r) => r.userId === "user-2");
        expect(me?.isMe).toBe(true);
        expect(other?.isMe).toBe(false);
    });

    it("should resolve the username to a user id before listing", async () => {
        vi.mocked(followRepo.getFollowers).mockResolvedValue([]);

        await useCase.execute(baseInput);

        expect(profileRepo.findByUsername).toHaveBeenCalledWith("testuser");
        expect(followRepo.getFollowers).toHaveBeenCalledWith("user-1", 10, 0);
    });

    it("should throw NotFoundError for an unknown username", async () => {
        vi.mocked(profileRepo.findByUsername).mockResolvedValue(null);

        // The controller used to raise this via a full profile load; the
        // endpoint must keep answering 404 rather than an empty 200.
        await expect(useCase.execute(baseInput)).rejects.toThrow(NotFoundError);

        expect(followRepo.getFollowers).not.toHaveBeenCalled();
    });
});
