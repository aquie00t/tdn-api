import { beforeEach, describe, expect, it, vi } from "vitest";
import { FollowUserUseCase } from "@core/use-cases/follow-user/follow-user/follow-user.usecase";
import { BadRequestError, NotFoundError, UserBlockedError } from "@core/errors";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import {
    buildProfile,
    buildBlockRepository,
} from "../../../helpers/mock-factories";
import type { IBlockRepository } from "@core/ports/repositories/block.repository";

describe("FollowUserUseCase", () => {
    let useCase: FollowUserUseCase;
    let followRepo: Pick<IFollowRepository, "followUser" | "getFollowersCount">;
    let notificationRepo: Pick<INotificationRepository, "create">;
    let realtimeSvc: Pick<RealtimePort, "emitToUser">;
    let profileRepo: Pick<IProfileRepository, "findByUserId">;
    let blockRepo: IBlockRepository;

    beforeEach(() => {
        followRepo = {
            followUser: vi.fn().mockResolvedValue(true),
            getFollowersCount: vi.fn().mockResolvedValue(42),
        };
        notificationRepo = { create: vi.fn() };
        realtimeSvc = { emitToUser: vi.fn() };
        profileRepo = {
            findByUserId: vi
                .fn()
                .mockResolvedValue(buildProfile({ userId: "user-2" })),
        };

        blockRepo = buildBlockRepository();

        useCase = new FollowUserUseCase(
            followRepo as IFollowRepository,
            notificationRepo as INotificationRepository,
            realtimeSvc as RealtimePort,
            profileRepo as IProfileRepository,
            blockRepo,
        );
    });

    it("should throw BadRequestError when user tries to follow themselves", async () => {
        await expect(
            useCase.execute({ currentUserId: "user-1", targetId: "user-1" }),
        ).rejects.toThrow(BadRequestError);
    });

    it("should throw NotFoundError when target user does not exist", async () => {
        vi.mocked(profileRepo.findByUserId).mockResolvedValue(null);

        await expect(
            useCase.execute({ currentUserId: "user-1", targetId: "user-2" }),
        ).rejects.toThrow(NotFoundError);

        expect(followRepo.followUser).not.toHaveBeenCalled();
    });

    it("should follow user, create notification and emit realtime when not already following", async () => {
        vi.mocked(followRepo.followUser).mockResolvedValue(true);
        vi.mocked(notificationRepo.create).mockResolvedValue(undefined);

        const result = await useCase.execute({
            currentUserId: "user-1",
            targetId: "user-2",
        });

        expect(followRepo.followUser).toHaveBeenCalledWith("user-1", "user-2");
        expect(notificationRepo.create).toHaveBeenCalledOnce();
        expect(realtimeSvc.emitToUser).toHaveBeenCalledWith(
            "user-2",
            "new-notification",
            expect.objectContaining({ type: "FOLLOW", issuerId: "user-1" }),
        );
        expect(result.followersCount).toBe(42);
    });

    it("should not notify again when the relationship was already there", async () => {
        // The write is still attempted - the database decides - but it reports
        // that it changed nothing, so nothing is announced.
        vi.mocked(followRepo.followUser).mockResolvedValue(false);

        const result = await useCase.execute({
            currentUserId: "user-1",
            targetId: "user-2",
        });

        expect(followRepo.followUser).toHaveBeenCalledOnce();
        expect(notificationRepo.create).not.toHaveBeenCalled();
        expect(realtimeSvc.emitToUser).not.toHaveBeenCalled();
        expect(result.followersCount).toBe(42);
    });

    it("should notify exactly once when two overlapping requests race", async () => {
        // Whichever request loses the insert gets false back instead of a
        // unique-constraint failure, so the target is told once.
        vi.mocked(followRepo.followUser)
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false);

        await Promise.all([
            useCase.execute({ currentUserId: "user-1", targetId: "user-2" }),
            useCase.execute({ currentUserId: "user-1", targetId: "user-2" }),
        ]);

        expect(followRepo.followUser).toHaveBeenCalledTimes(2);
        expect(notificationRepo.create).toHaveBeenCalledOnce();
        expect(realtimeSvc.emitToUser).toHaveBeenCalledOnce();
    });

    it("should always return followersCount regardless of follow state", async () => {
        vi.mocked(followRepo.followUser).mockResolvedValue(false);
        vi.mocked(followRepo.getFollowersCount).mockResolvedValue(100);

        const result = await useCase.execute({
            currentUserId: "user-1",
            targetId: "user-2",
        });

        expect(followRepo.getFollowersCount).toHaveBeenCalledWith("user-2");
        expect(result.followersCount).toBe(100);
    });

    describe("blocking", () => {
        it("should refuse the follow when a block stands either way", async () => {
            vi.mocked(blockRepo.existsBetween).mockResolvedValue(true);

            await expect(
                useCase.execute({
                    currentUserId: "user-1",
                    targetId: "user-2",
                }),
            ).rejects.toThrow(UserBlockedError);

            expect(followRepo.followUser).not.toHaveBeenCalled();
        });

        it("should announce the block rather than failing silently", async () => {
            vi.mocked(blockRepo.existsBetween).mockResolvedValue(true);

            // A follow that quietly does nothing reads as a bug and leaves the
            // blocked user tapping the button again; the client has a screen
            // for a 403 carrying this title.
            await expect(
                useCase.execute({
                    currentUserId: "user-1",
                    targetId: "user-2",
                }),
            ).rejects.toMatchObject({ statusCode: 403 });
        });

        it("should not ask about blocks before the target is known to exist", async () => {
            vi.mocked(profileRepo.findByUserId).mockResolvedValue(null);

            await expect(
                useCase.execute({
                    currentUserId: "user-1",
                    targetId: "user-2",
                }),
            ).rejects.toThrow(NotFoundError);

            expect(blockRepo.existsBetween).not.toHaveBeenCalled();
        });
    });
});
