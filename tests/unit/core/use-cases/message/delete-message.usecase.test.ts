import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteMessageUseCase } from "@core/use-cases/message/delete-message/delete-message.usecase";
import { Conversation } from "@core/domain/entities/conversation.entity";
import { Message } from "@core/domain/entities/message.entity";
import { ChatEvents } from "@core/domain/constants/chat-events.constants";
import { ConversationStatus, MediaModerationStatus } from "@core/domain/enums";
import { ConversationNotFoundError, ForbiddenError } from "@core/errors";
import type { IConversationRepository } from "@core/ports/repositories/conversation.repository";
import type { IMessageRepository } from "@core/ports/repositories/message.repository";
import type { RealtimePort } from "@core/ports/services/realtime.port";

const SENDER = "aaaa-1111";
const RECIPIENT = "bbbb-2222";

const buildMessage = (deletedAt: Date | null = null): Message =>
    Message.with({
        id: "msg-1",
        conversationId: "conv-1",
        senderId: SENDER,
        content: "hello",
        mediaUrls: [],
        isSensitive: false,
        mediaStatus: MediaModerationStatus.APPROVED,
        deletedAt,
        createdAt: new Date("2026-09-03T12:00:00.000Z"),
    });

describe("DeleteMessageUseCase", () => {
    let useCase: DeleteMessageUseCase;
    let messageRepo: Pick<IMessageRepository, "findById" | "softDelete">;
    let conversationRepo: Pick<IConversationRepository, "findById">;
    let realtimeSvc: Pick<RealtimePort, "emitToUser">;

    beforeEach(() => {
        messageRepo = {
            findById: vi.fn().mockResolvedValue(buildMessage()),
            softDelete: vi.fn(),
        };
        conversationRepo = {
            findById: vi.fn().mockResolvedValue(
                Conversation.with({
                    id: "conv-1",
                    userAId: SENDER,
                    userBId: RECIPIENT,
                    initiatorId: SENDER,
                    status: ConversationStatus.ACCEPTED,
                    userAUnread: 0,
                    userBUnread: 0,
                }),
            ),
        };
        realtimeSvc = { emitToUser: vi.fn() };

        useCase = new DeleteMessageUseCase(
            messageRepo as IMessageRepository,
            conversationRepo as IConversationRepository,
            realtimeSvc as RealtimePort,
        );
    });

    it("withdraws the sender's own message", async () => {
        await useCase.execute({ messageId: "msg-1", userId: SENDER });

        expect(messageRepo.softDelete).toHaveBeenCalledWith(
            "msg-1",
            expect.any(Date),
        );
    });

    it("tells the other participant the message is gone", async () => {
        await useCase.execute({ messageId: "msg-1", userId: SENDER });

        expect(realtimeSvc.emitToUser).toHaveBeenCalledWith(
            RECIPIENT,
            ChatEvents.MESSAGE_DELETED,
            expect.objectContaining({ messageId: "msg-1" }),
        );
    });

    it("refuses to withdraw somebody else's message", async () => {
        await expect(
            useCase.execute({ messageId: "msg-1", userId: RECIPIENT }),
        ).rejects.toThrow(ForbiddenError);

        expect(messageRepo.softDelete).not.toHaveBeenCalled();
    });

    it("is a no-op on a message that is already withdrawn", async () => {
        vi.mocked(messageRepo.findById).mockResolvedValue(
            buildMessage(new Date()),
        );

        await useCase.execute({ messageId: "msg-1", userId: SENDER });

        expect(messageRepo.softDelete).not.toHaveBeenCalled();
        expect(realtimeSvc.emitToUser).not.toHaveBeenCalled();
    });

    it("raises when the message does not exist", async () => {
        vi.mocked(messageRepo.findById).mockResolvedValue(null);

        await expect(
            useCase.execute({ messageId: "msg-1", userId: SENDER }),
        ).rejects.toThrow(ConversationNotFoundError);
    });
});
