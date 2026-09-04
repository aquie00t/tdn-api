import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotifyMentionedUsersUseCase } from "@core/use-cases/notification/notify-mentioned-users";
import type { Notification } from "@core/domain/entities/notification.entity";
import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import { NotificationType } from "@core/domain/enums/notification-type.enum";

describe("NotifyMentionedUsersUseCase", () => {
    let useCase: NotifyMentionedUsersUseCase;
    let notificationRepository: Pick<INotificationRepository, "createMany">;
    let realtimeService: RealtimePort;

    const input = {
        issuerId: "author-1",
        mentionedUserIds: ["user-1", "user-2"],
        target: { postId: "post-1" },
    };

    /** The notifications handed to createMany on the first call. */
    function writtenNotifications(): Notification[] {
        return vi.mocked(notificationRepository.createMany).mock
            .calls[0][0] as Notification[];
    }

    beforeEach(() => {
        notificationRepository = {
            createMany: vi.fn().mockResolvedValue(0),
        };
        realtimeService = { emitToUser: vi.fn() };
        useCase = new NotifyMentionedUsersUseCase(
            notificationRepository as INotificationRepository,
            realtimeService,
        );
    });

    describe("recipients", () => {
        it("should notify every mentioned user once", async () => {
            const result = await useCase.execute(input);

            expect(result).toBe(2);
            expect(notificationRepository.createMany).toHaveBeenCalledTimes(1);
            expect(writtenNotifications().map((n) => n.recipientId)).toEqual([
                "user-1",
                "user-2",
            ]);
        });

        it("should never notify the author of the content", async () => {
            const result = await useCase.execute({
                ...input,
                mentionedUserIds: ["author-1", "user-1"],
            });

            expect(result).toBe(1);
            expect(writtenNotifications().map((n) => n.recipientId)).toEqual([
                "user-1",
            ]);
        });

        it("should write one row for a user named twice", async () => {
            const result = await useCase.execute({
                ...input,
                mentionedUserIds: ["user-1", "user-1", "user-1"],
            });

            expect(result).toBe(1);
            expect(realtimeService.emitToUser).toHaveBeenCalledTimes(1);
        });

        it("should skip a user the same action already notified", async () => {
            const result = await useCase.execute({
                ...input,
                excludeUserIds: ["user-2"],
            });

            expect(result).toBe(1);
            expect(writtenNotifications().map((n) => n.recipientId)).toEqual([
                "user-1",
            ]);
        });

        it("should touch nothing when every mention is suppressed", async () => {
            const result = await useCase.execute({
                ...input,
                excludeUserIds: ["user-1", "user-2"],
            });

            expect(result).toBe(0);
            expect(notificationRepository.createMany).not.toHaveBeenCalled();
            expect(realtimeService.emitToUser).not.toHaveBeenCalled();
        });

        it("should touch nothing when nobody is mentioned", async () => {
            const result = await useCase.execute({
                ...input,
                mentionedUserIds: [],
            });

            expect(result).toBe(0);
            expect(notificationRepository.createMany).not.toHaveBeenCalled();
        });
    });

    describe("notification shape", () => {
        it("should carry the post as the deep-link target", async () => {
            await useCase.execute({ ...input, mentionedUserIds: ["user-1"] });

            const [notification] = writtenNotifications();
            expect(notification.type).toBe(NotificationType.MENTION);
            expect(notification.issuerId).toBe("author-1");
            expect(notification.postId).toBe("post-1");
            expect(notification.commentId).toBeUndefined();
            expect(notification.referenceId).toBe("post-1");
        });

        it("should point at the comment when the mention is in one", async () => {
            await useCase.execute({
                ...input,
                mentionedUserIds: ["user-1"],
                target: { postId: "post-1", commentId: "comment-1" },
            });

            const [notification] = writtenNotifications();
            expect(notification.postId).toBe("post-1");
            expect(notification.commentId).toBe("comment-1");
            expect(notification.referenceId).toBe("comment-1");
        });
    });

    describe("realtime", () => {
        it("should push the notification to each recipient", async () => {
            await useCase.execute(input);

            expect(realtimeService.emitToUser).toHaveBeenCalledTimes(2);
            expect(realtimeService.emitToUser).toHaveBeenCalledWith(
                "user-1",
                "new-notification",
                expect.objectContaining({
                    type: NotificationType.MENTION,
                    issuerId: "author-1",
                    postId: "post-1",
                    referenceId: "post-1",
                }),
            );
        });

        it("should carry the article slug so the client can deep-link", async () => {
            await useCase.execute({
                ...input,
                mentionedUserIds: ["user-1"],
                target: { articleId: "article-1" },
                articleSlug: "hello-1a2b3c4d",
            });

            expect(realtimeService.emitToUser).toHaveBeenCalledWith(
                "user-1",
                "new-notification",
                expect.objectContaining({
                    articleId: "article-1",
                    articleSlug: "hello-1a2b3c4d",
                    referenceId: "article-1",
                }),
            );
        });
    });
});
