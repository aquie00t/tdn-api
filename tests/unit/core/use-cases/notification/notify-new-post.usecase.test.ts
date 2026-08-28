import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotifyNewPostUseCase } from "@core/use-cases/notification/notify-new-post";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import { PostType } from "@core/domain/enums/post-type.enum";
import { NotificationType } from "@core/domain/enums/notification-type.enum";

describe("NotifyNewPostUseCase", () => {
    let useCase: NotifyNewPostUseCase;
    let followUserRepository: Pick<IFollowRepository, "getFollowerIds">;
    let notificationRepository: Pick<INotificationRepository, "createMany">;
    let realtimeService: RealtimePort;

    const input = {
        postId: "post-1",
        authorId: "bot-1",
        postType: PostType.TECH_NEWS,
    };

    beforeEach(() => {
        followUserRepository = {
            getFollowerIds: vi.fn().mockResolvedValue([]),
        };
        notificationRepository = {
            createMany: vi.fn().mockResolvedValue(0),
        };
        realtimeService = { emitToUser: vi.fn() };
        useCase = new NotifyNewPostUseCase(
            followUserRepository as IFollowRepository,
            notificationRepository as INotificationRepository,
            realtimeService,
        );
    });

    describe("post types that do not notify", () => {
        it("should ignore a COMMUNITY post without touching any repository", async () => {
            const result = await useCase.execute({
                ...input,
                postType: PostType.COMMUNITY,
            });

            expect(result).toBe(0);
            expect(followUserRepository.getFollowerIds).not.toHaveBeenCalled();
            expect(notificationRepository.createMany).not.toHaveBeenCalled();
            expect(realtimeService.emitToUser).not.toHaveBeenCalled();
        });

        it("should ignore a JOB_POSTING post", async () => {
            await useCase.execute({
                ...input,
                postType: PostType.JOB_POSTING,
            });

            expect(followUserRepository.getFollowerIds).not.toHaveBeenCalled();
        });
    });

    describe("post types that notify", () => {
        it.each([PostType.TECH_NEWS, PostType.SYSTEM_UPDATE])(
            "should fan %s out to followers",
            async (postType) => {
                vi.mocked(
                    followUserRepository.getFollowerIds,
                ).mockResolvedValue(["user-1", "user-2"]);

                const result = await useCase.execute({ ...input, postType });

                expect(result).toBe(2);
                expect(
                    followUserRepository.getFollowerIds,
                ).toHaveBeenCalledWith("bot-1");
                expect(notificationRepository.createMany).toHaveBeenCalledOnce();
            },
        );
    });

    it("should build one NEW_POST notification per follower", async () => {
        vi.mocked(followUserRepository.getFollowerIds).mockResolvedValue([
            "user-1",
            "user-2",
        ]);

        await useCase.execute(input);

        const [notifications] = vi.mocked(notificationRepository.createMany)
            .mock.calls[0];

        expect(notifications).toHaveLength(2);
        expect(notifications.map((n) => n.recipientId)).toEqual([
            "user-1",
            "user-2",
        ]);
        notifications.forEach((notification) => {
            expect(notification.issuerId).toBe("bot-1");
            expect(notification.type).toBe(NotificationType.NEW_POST);
            expect(notification.postId).toBe("post-1");
            expect(notification.referenceId).toBe("post-1");
            expect(notification.isRead).toBe(false);
        });
    });

    it("should emit a realtime event per follower", async () => {
        vi.mocked(followUserRepository.getFollowerIds).mockResolvedValue([
            "user-1",
            "user-2",
        ]);

        await useCase.execute(input);

        expect(realtimeService.emitToUser).toHaveBeenCalledTimes(2);
        expect(realtimeService.emitToUser).toHaveBeenCalledWith(
            "user-1",
            "new-notification",
            {
                type: NotificationType.NEW_POST,
                issuerId: "bot-1",
                postId: "post-1",
                referenceId: "post-1",
            },
        );
    });

    it("should do nothing when the author has no followers", async () => {
        vi.mocked(followUserRepository.getFollowerIds).mockResolvedValue([]);

        const result = await useCase.execute(input);

        expect(result).toBe(0);
        expect(notificationRepository.createMany).not.toHaveBeenCalled();
        expect(realtimeService.emitToUser).not.toHaveBeenCalled();
    });

    it("should never notify the author about their own post", async () => {
        vi.mocked(followUserRepository.getFollowerIds).mockResolvedValue([
            "bot-1",
            "user-1",
        ]);

        const result = await useCase.execute(input);

        expect(result).toBe(1);
        const [notifications] = vi.mocked(notificationRepository.createMany)
            .mock.calls[0];
        expect(notifications.map((n) => n.recipientId)).toEqual(["user-1"]);
        expect(realtimeService.emitToUser).toHaveBeenCalledOnce();
    });

    it("should not emit anything when the author is their only follower", async () => {
        vi.mocked(followUserRepository.getFollowerIds).mockResolvedValue([
            "bot-1",
        ]);

        const result = await useCase.execute(input);

        expect(result).toBe(0);
        expect(notificationRepository.createMany).not.toHaveBeenCalled();
    });

    it("should propagate a repository failure to the caller", async () => {
        vi.mocked(followUserRepository.getFollowerIds).mockResolvedValue([
            "user-1",
        ]);
        vi.mocked(notificationRepository.createMany).mockRejectedValue(
            new Error("DB error"),
        );

        await expect(useCase.execute(input)).rejects.toThrow("DB error");
    });
});
