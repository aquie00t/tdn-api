import { beforeEach, describe, expect, it, vi } from "vitest";
import { PushNotifyingRealtimeService } from "@infrastructure/realtime/push-notifying-realtime.service";
import { NotificationType } from "@core/domain/enums";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import type { SendPushNotificationUseCase } from "@core/use-cases/notification/send-push";

describe("PushNotifyingRealtimeService", () => {
    let transport: RealtimePort;
    let push: Pick<SendPushNotificationUseCase, "execute">;
    let service: PushNotifyingRealtimeService;

    const notification = {
        type: NotificationType.LIKE,
        issuerId: "user-2",
        postId: "post-1",
    };

    beforeEach(() => {
        transport = { emitToUser: vi.fn() };
        push = { execute: vi.fn().mockResolvedValue(undefined) };

        service = new PushNotifyingRealtimeService(
            transport,
            push as SendPushNotificationUseCase,
        );
    });

    it("should always emit on the socket", () => {
        service.emitToUser("user-1", "new-notification", notification);

        expect(transport.emitToUser).toHaveBeenCalledWith(
            "user-1",
            "new-notification",
            notification,
        );
    });

    it("should push a notification event", () => {
        service.emitToUser("user-1", "new-notification", notification);

        expect(push.execute).toHaveBeenCalledWith({
            recipientId: "user-1",
            issuerId: "user-2",
            type: NotificationType.LIKE,
            postId: "post-1",
            commentId: undefined,
            articleId: undefined,
            articleSlug: undefined,
        });
    });

    it("should never push a chat event", () => {
        // Message text is encrypted at rest. A push payload passes through a
        // third party on its way to the phone, so chat must not travel this
        // way at all - not even truncated.
        service.emitToUser("user-1", "message:new", {
            conversationId: "conv-1",
            messageId: "msg-1",
            senderId: "user-2",
            preview: "something private",
        });

        expect(transport.emitToUser).toHaveBeenCalled();
        expect(push.execute).not.toHaveBeenCalled();
    });

    it("should ignore a notification event missing its issuer or type", () => {
        service.emitToUser("user-1", "new-notification", {
            type: "",
            issuerId: "",
        });

        expect(push.execute).not.toHaveBeenCalled();
    });

    it("should not let a push failure reach the caller or escape as an unhandled rejection", async () => {
        vi.mocked(push.execute).mockRejectedValue(new Error("boom"));

        expect(() =>
            service.emitToUser("user-1", "new-notification", notification),
        ).not.toThrow();

        // The socket write is what mattered and it already happened.
        expect(transport.emitToUser).toHaveBeenCalled();
        await new Promise((resolve) => setImmediate(resolve));
    });
});
