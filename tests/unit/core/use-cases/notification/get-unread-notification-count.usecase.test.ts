import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetUnreadNotificationCountUseCase } from "@core/use-cases/notification/unread-count";
import type { INotificationRepository } from "@core/ports/repositories/notification.repository";

describe("GetUnreadNotificationCountUseCase", () => {
    let useCase: GetUnreadNotificationCountUseCase;
    let notificationRepo: Pick<INotificationRepository, "getUnreadCount">;

    beforeEach(() => {
        notificationRepo = {
            getUnreadCount: vi.fn(),
        };
        useCase = new GetUnreadNotificationCountUseCase(
            notificationRepo as INotificationRepository,
        );
    });

    it("should return the count for the given user", async () => {
        vi.mocked(notificationRepo.getUnreadCount).mockResolvedValue(7);

        const result = await useCase.execute({ userId: "user-1" });

        expect(result).toBe(7);
        expect(notificationRepo.getUnreadCount).toHaveBeenCalledWith("user-1");
    });

    it("should return zero when nothing is unread", async () => {
        vi.mocked(notificationRepo.getUnreadCount).mockResolvedValue(0);

        await expect(useCase.execute({ userId: "user-1" })).resolves.toBe(0);
    });

    it("should propagate repository errors", async () => {
        vi.mocked(notificationRepo.getUnreadCount).mockRejectedValue(
            new Error("Database connection lost"),
        );

        await expect(useCase.execute({ userId: "user-1" })).rejects.toThrow(
            "Database connection lost",
        );
    });
});
