import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarkNotificationAsReadUseCase } from "@core/use-cases/notification/mark-one";
import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import { NotFoundError } from "@core/errors";

describe("MarkNotificationAsReadUseCase", () => {
    let useCase: MarkNotificationAsReadUseCase;
    let notificationRepo: Pick<INotificationRepository, "markAsRead">;

    beforeEach(() => {
        notificationRepo = {
            markAsRead: vi.fn(),
        };
        useCase = new MarkNotificationAsReadUseCase(
            notificationRepo as INotificationRepository,
        );
    });

    it("should mark the notification as read for its recipient", async () => {
        vi.mocked(notificationRepo.markAsRead).mockResolvedValue(true);

        await useCase.execute({
            notificationId: "notif-1",
            userId: "user-1",
        });

        expect(notificationRepo.markAsRead).toHaveBeenCalledWith(
            "notif-1",
            "user-1",
        );
    });

    it("should throw NotFoundError when nothing matched", async () => {
        vi.mocked(notificationRepo.markAsRead).mockResolvedValue(false);

        await expect(
            useCase.execute({ notificationId: "notif-1", userId: "user-1" }),
        ).rejects.toThrow(NotFoundError);
    });

    it("should answer identically for another user's notification", async () => {
        // The repository scopes the update by recipient, so somebody else's
        // notification matches nothing and must not be distinguishable from
        // one that does not exist.
        vi.mocked(notificationRepo.markAsRead).mockResolvedValue(false);

        await expect(
            useCase.execute({ notificationId: "notif-1", userId: "intruder" }),
        ).rejects.toThrow("Notification not found.");
    });

    it("should propagate repository errors", async () => {
        vi.mocked(notificationRepo.markAsRead).mockRejectedValue(
            new Error("Database connection lost"),
        );

        await expect(
            useCase.execute({ notificationId: "notif-1", userId: "user-1" }),
        ).rejects.toThrow("Database connection lost");
    });
});
