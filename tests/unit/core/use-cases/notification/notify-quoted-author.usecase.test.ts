import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotifyQuotedAuthorUseCase } from "@core/use-cases/notification/notify-quoted-author";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import { NotificationType } from "@core/domain/enums/notification-type.enum";
import { buildPost } from "../../../helpers/mock-factories";

describe("NotifyQuotedAuthorUseCase", () => {
    let useCase: NotifyQuotedAuthorUseCase;
    let postRepository: Pick<IPostRepository, "findById">;
    let notificationRepository: Pick<INotificationRepository, "create">;
    let realtimeService: RealtimePort;

    const input = {
        quotePostId: "quote-1",
        quotedPostId: "post-0",
        issuerId: "user-2",
    };

    beforeEach(() => {
        postRepository = {
            findById: vi
                .fn()
                .mockResolvedValue(
                    buildPost({ id: "post-0", author: { id: "user-1" } }),
                ),
        };
        notificationRepository = {
            create: vi.fn().mockResolvedValue(undefined),
        };
        realtimeService = { emitToUser: vi.fn() };
        useCase = new NotifyQuotedAuthorUseCase(
            postRepository as IPostRepository,
            notificationRepository as INotificationRepository,
            realtimeService,
        );
    });

    it("should notify the author of the quoted post", async () => {
        const result = await useCase.execute(input);

        expect(result).toBe(1);
        expect(notificationRepository.create).toHaveBeenCalledOnce();

        const notification = vi.mocked(notificationRepository.create).mock
            .calls[0][0];
        expect(notification.recipientId).toBe("user-1");
        expect(notification.issuerId).toBe("user-2");
        expect(notification.type).toBe(NotificationType.QUOTE);
    });

    it("should point the notification at the quote, not at the post it quotes", async () => {
        // The recipient already knows their own post; what they want to open
        // is what somebody said about it.
        await useCase.execute(input);

        const notification = vi.mocked(notificationRepository.create).mock
            .calls[0][0];
        expect(notification.postId).toBe("quote-1");
        expect(notification.referenceId).toBe("quote-1");
    });

    it("should push the same target over realtime", async () => {
        await useCase.execute(input);

        expect(realtimeService.emitToUser).toHaveBeenCalledWith(
            "user-1",
            "new-notification",
            {
                type: NotificationType.QUOTE,
                issuerId: "user-2",
                postId: "quote-1",
                referenceId: "quote-1",
            },
        );
    });

    it("should stay silent when an account quotes itself", async () => {
        vi.mocked(postRepository.findById).mockResolvedValue(
            buildPost({ id: "post-0", author: { id: "user-2" } }),
        );

        const result = await useCase.execute(input);

        expect(result).toBe(0);
        expect(notificationRepository.create).not.toHaveBeenCalled();
        expect(realtimeService.emitToUser).not.toHaveBeenCalled();
    });

    it("should stay silent when the quoted post is already gone", async () => {
        // A narrow race between the post committing and this call.
        vi.mocked(postRepository.findById).mockResolvedValue(null);

        const result = await useCase.execute(input);

        expect(result).toBe(0);
        expect(notificationRepository.create).not.toHaveBeenCalled();
        expect(realtimeService.emitToUser).not.toHaveBeenCalled();
    });
});
