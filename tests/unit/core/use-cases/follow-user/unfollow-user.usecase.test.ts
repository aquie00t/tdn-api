import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnfollowUserUseCase } from "@core/use-cases/follow-user/unfollow-user/unfollow-user.usecase";
import { BadRequestError, NotFoundError } from "@core/errors";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import { NotificationType } from "@core/domain/enums/notification-type.enum";
import { buildProfile } from "../../../helpers/mock-factories";

describe("UnfollowUserUseCase", () => {
    let useCase: UnfollowUserUseCase;
    let followRepo: Pick<
        IFollowRepository,
        "unfollowUser" | "getFollowersCount"
    >;
    let profileRepo: Pick<IProfileRepository, "findByUserId">;
    let notificationRepo: Pick<INotificationRepository, "deleteByTarget">;

    beforeEach(() => {
        followRepo = {
            unfollowUser: vi.fn().mockResolvedValue(true),
            getFollowersCount: vi.fn().mockResolvedValue(10),
        };
        profileRepo = { findByUserId: vi.fn() };
        notificationRepo = { deleteByTarget: vi.fn().mockResolvedValue(1) };

        useCase = new UnfollowUserUseCase(
            followRepo as IFollowRepository,
            profileRepo as IProfileRepository,
            notificationRepo as INotificationRepository,
        );
    });

    it("should throw NotFoundError when target profile does not exist", async () => {
        vi.mocked(profileRepo.findByUserId).mockResolvedValue(null);

        await expect(
            useCase.execute({ currentUserId: "user-1", targetId: "user-2" }),
        ).rejects.toThrow(NotFoundError);
    });

    it("should throw BadRequestError when user tries to unfollow themselves", async () => {
        vi.mocked(profileRepo.findByUserId).mockResolvedValue(
            buildProfile({ userId: "user-1" }),
        );

        await expect(
            useCase.execute({ currentUserId: "user-1", targetId: "user-1" }),
        ).rejects.toThrow(BadRequestError);
    });

    it("should unfollow user when currently following", async () => {
        vi.mocked(profileRepo.findByUserId).mockResolvedValue(
            buildProfile({ userId: "user-2" }),
        );
        vi.mocked(followRepo.unfollowUser).mockResolvedValue(true);

        const result = await useCase.execute({
            currentUserId: "user-1",
            targetId: "user-2",
        });

        expect(followRepo.unfollowUser).toHaveBeenCalledWith(
            "user-1",
            "user-2",
        );
        expect(result.followersCount).toBe(10);
    });

    it("should stay quiet when there was nothing to unfollow (idempotent)", async () => {
        vi.mocked(profileRepo.findByUserId).mockResolvedValue(
            buildProfile({ userId: "user-2" }),
        );
        vi.mocked(followRepo.unfollowUser).mockResolvedValue(false);

        await expect(
            useCase.execute({ currentUserId: "user-1", targetId: "user-2" }),
        ).resolves.toBeDefined();
    });

    it("should take the follow notification back with the follow", async () => {
        vi.mocked(profileRepo.findByUserId).mockResolvedValue(
            buildProfile({ userId: "user-2" }),
        );
        vi.mocked(followRepo.unfollowUser).mockResolvedValue(true);

        await useCase.execute({ currentUserId: "user-1", targetId: "user-2" });

        expect(notificationRepo.deleteByTarget).toHaveBeenCalledWith({
            recipientId: "user-2",
            issuerId: "user-1",
            type: NotificationType.FOLLOW,
        });
    });

    it("should not delete notifications when there was no follow to undo", async () => {
        vi.mocked(profileRepo.findByUserId).mockResolvedValue(
            buildProfile({ userId: "user-2" }),
        );
        vi.mocked(followRepo.unfollowUser).mockResolvedValue(false);

        await useCase.execute({ currentUserId: "user-1", targetId: "user-2" });

        expect(notificationRepo.deleteByTarget).not.toHaveBeenCalled();
    });

    it("should always return followersCount regardless of follow state", async () => {
        vi.mocked(profileRepo.findByUserId).mockResolvedValue(
            buildProfile({ userId: "user-2" }),
        );
        vi.mocked(followRepo.unfollowUser).mockResolvedValue(false);
        vi.mocked(followRepo.getFollowersCount).mockResolvedValue(5);

        const result = await useCase.execute({
            currentUserId: "user-1",
            targetId: "user-2",
        });

        expect(followRepo.getFollowersCount).toHaveBeenCalledWith("user-2");
        expect(result.followersCount).toBe(5);
    });
});
