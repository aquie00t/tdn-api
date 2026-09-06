import { beforeEach, describe, expect, it, vi } from "vitest";
import { SendPushNotificationUseCase } from "@core/use-cases/notification/send-push";
import { DeviceToken } from "@core/domain/entities/device-token.entity";
import { DevicePlatform, NotificationType } from "@core/domain/enums";
import type { IDeviceTokenRepository } from "@core/ports/repositories/device-token.repository";
import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { PushPort } from "@core/ports/services/push.port";
import { buildUser } from "../../../helpers/mock-factories";

function buildDevice(token: string, locale: string | null = "en-GB") {
    return DeviceToken.with({
        id: `device-${token}`,
        token,
        userId: "user-1",
        platform: DevicePlatform.ANDROID,
        locale,
        lastSeenAt: new Date(),
    });
}

describe("SendPushNotificationUseCase", () => {
    let devices: Pick<
        IDeviceTokenRepository,
        "findByUserId" | "deleteByTokens"
    >;
    let users: Pick<IUserRepository, "findById">;
    let notifications: Pick<INotificationRepository, "getUnreadCount">;
    let push: Pick<PushPort, "send">;
    let logger: LoggerPort;
    let useCase: SendPushNotificationUseCase;

    const input = {
        recipientId: "user-1",
        issuerId: "user-2",
        type: NotificationType.FOLLOW,
    };

    beforeEach(() => {
        devices = {
            findByUserId: vi.fn().mockResolvedValue([buildDevice("tok-a")]),
            deleteByTokens: vi.fn().mockResolvedValue(1),
        };
        users = {
            findById: vi
                .fn()
                .mockResolvedValue(buildUser({ username: "ada" })),
        };
        notifications = { getUnreadCount: vi.fn().mockResolvedValue(4) };
        push = {
            send: vi.fn().mockResolvedValue({ delivered: 1, invalidTokens: [] }),
        };
        logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as unknown as LoggerPort;

        useCase = new SendPushNotificationUseCase(
            devices as IDeviceTokenRepository,
            users as IUserRepository,
            notifications as INotificationRepository,
            push as PushPort,
            logger,
        );
    });

    it("should address one message per registered device", async () => {
        vi.mocked(devices.findByUserId).mockResolvedValue([
            buildDevice("tok-a"),
            buildDevice("tok-b"),
        ]);

        await useCase.execute(input);

        const messages = vi.mocked(push.send).mock.calls[0]![0];

        expect(messages.map((m) => m.to)).toEqual(["tok-a", "tok-b"]);
        expect(messages[0]!.badge).toBe(4);
    });

    it("should write in the language the device is set to", async () => {
        vi.mocked(devices.findByUserId).mockResolvedValue([
            buildDevice("tr-device", "tr-TR"),
            buildDevice("en-device", "en-US"),
        ]);

        await useCase.execute(input);

        const [turkish, english] = vi.mocked(push.send).mock.calls[0]![0];

        expect(turkish!.body).toBe("@ada seni takip etmeye başladı.");
        expect(english!.body).toBe("@ada started following you.");
    });

    it("should carry ids for the deep link and nothing anybody wrote", async () => {
        await useCase.execute({
            ...input,
            type: NotificationType.COMMENT,
            postId: "post-1",
            commentId: "comment-1",
        });

        const message = vi.mocked(push.send).mock.calls[0]![0][0]!;

        expect(message.data).toEqual({
            type: NotificationType.COMMENT,
            postId: "post-1",
            commentId: "comment-1",
        });
        // The payload travels through a third party to reach the phone, so it
        // must never grow a field carrying content.
        expect(Object.keys(message.data)).toHaveLength(3);
    });

    it("should send nothing when the recipient has no devices", async () => {
        vi.mocked(devices.findByUserId).mockResolvedValue([]);

        await useCase.execute(input);

        expect(push.send).not.toHaveBeenCalled();
        expect(users.findById).not.toHaveBeenCalled();
    });

    it("should send nothing when the issuer cannot be named", async () => {
        vi.mocked(users.findById).mockResolvedValue(null);

        await useCase.execute(input);

        expect(push.send).not.toHaveBeenCalled();
    });

    it("should delete the tokens the service rejects", async () => {
        vi.mocked(push.send).mockResolvedValue({
            delivered: 0,
            invalidTokens: ["tok-a"],
        });

        await useCase.execute(input);

        expect(devices.deleteByTokens).toHaveBeenCalledWith(["tok-a"]);
    });

    it("should not touch the table when every token was accepted", async () => {
        await useCase.execute(input);

        expect(devices.deleteByTokens).not.toHaveBeenCalled();
    });

    it("should swallow a failure rather than fail the caller", async () => {
        // The notification is already stored and already on the socket; the
        // caller is a fire-and-forget path with nothing to do about this.
        vi.mocked(push.send).mockRejectedValue(new Error("expo down"));

        await expect(useCase.execute(input)).resolves.toBeUndefined();
        expect(logger.error).toHaveBeenCalled();
    });
});
