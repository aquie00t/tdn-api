import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetFollowingUseCase } from "@core/use-cases/follow-user/get-following/get-following.usecase";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import { NotFoundError } from "@core/errors";
import { buildProfile } from "../../../helpers/mock-factories";

const buildFollowingEntry = (userId: string) => ({
    userId,
    username: `user_${userId}`,
    fullName: `User ${userId}`,
    avatarUrl: "https://example.com/avatar.png",
    bio: null,
});

describe("GetFollowingUseCase", () => {
    let useCase: GetFollowingUseCase;
    let followRepo: Pick<
        IFollowRepository,
        "getFollowing" | "checkIsFollowingBulk"
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
            getFollowing: vi.fn(),
            checkIsFollowingBulk: vi.fn(),
        };
        profileRepo = {
            findByUsername: vi
                .fn()
                .mockResolvedValue(buildProfile({ userId: "user-1" })),
        };
        useCase = new GetFollowingUseCase(
            followRepo as IFollowRepository,
            profileRepo as IProfileRepository,
        );
    });

    it("should return empty array when user follows nobody", async () => {
        vi.mocked(followRepo.getFollowing).mockResolvedValue([]);

        const result = await useCase.execute(baseInput);

        expect(result).toEqual([]);
        expect(followRepo.checkIsFollowingBulk).not.toHaveBeenCalled();
    });

    it("should return following list with isFollowing=false when no currentUserId", async () => {
        vi.mocked(followRepo.getFollowing).mockResolvedValue([
            buildFollowingEntry("user-2"),
        ]);

        const result = await useCase.execute(baseInput);

        expect(result).toHaveLength(1);
        expect(result[0].isFollowing).toBe(false);
        expect(result[0].isMe).toBe(false);
        expect(followRepo.checkIsFollowingBulk).not.toHaveBeenCalled();
    });

    it("should mark isFollowing=true for users currentUser also follows", async () => {
        vi.mocked(followRepo.getFollowing).mockResolvedValue([
            buildFollowingEntry("user-2"),
            buildFollowingEntry("user-3"),
        ]);
        vi.mocked(followRepo.checkIsFollowingBulk).mockResolvedValue([
            "user-3",
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
        expect(user2?.isFollowing).toBe(false);
        expect(user3?.isFollowing).toBe(true);
    });

    it("should mark isMe=true when a followed user is the currentUser", async () => {
        vi.mocked(followRepo.getFollowing).mockResolvedValue([
            buildFollowingEntry("user-1"),
            buildFollowingEntry("user-2"),
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
        vi.mocked(followRepo.getFollowing).mockResolvedValue([]);

        await useCase.execute(baseInput);

        expect(profileRepo.findByUsername).toHaveBeenCalledWith("testuser");
        expect(followRepo.getFollowing).toHaveBeenCalledWith("user-1", 10, 0);
    });

    it("should throw NotFoundError for an unknown username", async () => {
        vi.mocked(profileRepo.findByUsername).mockResolvedValue(null);

        // The controller used to raise this via a full profile load; the
        // endpoint must keep answering 404 rather than an empty 200.
        await expect(useCase.execute(baseInput)).rejects.toThrow(NotFoundError);

        expect(followRepo.getFollowing).not.toHaveBeenCalled();
    });
});
