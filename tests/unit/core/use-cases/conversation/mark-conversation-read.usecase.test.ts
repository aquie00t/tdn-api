import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarkConversationReadUseCase } from "@core/use-cases/conversation/mark-conversation-read/mark-conversation-read.usecase";
import { Conversation } from "@core/domain/entities/conversation.entity";
import { ChatEvents } from "@core/domain/constants/chat-events.constants";
import { ConversationStatus } from "@core/domain/enums";
import { ConversationNotFoundError } from "@core/errors";
import type { IConversationRepository } from "@core/ports/repositories/conversation.repository";
import type { RealtimePort } from "@core/ports/services/realtime.port";

const INITIATOR = "aaaa-1111";
const RECIPIENT = "bbbb-2222";

const buildConversation = (status: ConversationStatus): Conversation =>
    Conversation.with({
        id: "conv-1",
        userAId: INITIATOR,
        userBId: RECIPIENT,
        initiatorId: INITIATOR,
        status,
        userAUnread: 0,
        userBUnread: 2,
    });

describe("MarkConversationReadUseCase", () => {
    let useCase: MarkConversationReadUseCase;
    let conversationRepo: Pick<
        IConversationRepository,
        "findById" | "markRead"
    >;
    let realtimeSvc: Pick<RealtimePort, "emitToUser">;

    beforeEach(() => {
        conversationRepo = {
            findById: vi
                .fn()
                .mockResolvedValue(
                    buildConversation(ConversationStatus.ACCEPTED),
                ),
            markRead: vi.fn().mockResolvedValue(true),
        };
        realtimeSvc = { emitToUser: vi.fn() };

        useCase = new MarkConversationReadUseCase(
            conversationRepo as IConversationRepository,
            realtimeSvc as RealtimePort,
        );
    });

    it("clears the reader's unread state", async () => {
        await useCase.execute({
            conversationId: "conv-1",
            userId: RECIPIENT,
        });

        expect(conversationRepo.markRead).toHaveBeenCalledWith(
            "conv-1",
            RECIPIENT,
            expect.any(Date),
        );
    });

    it("sends a read receipt to the other participant", async () => {
        await useCase.execute({
            conversationId: "conv-1",
            userId: RECIPIENT,
        });

        expect(realtimeSvc.emitToUser).toHaveBeenCalledWith(
            INITIATOR,
            ChatEvents.MESSAGE_READ,
            expect.objectContaining({
                conversationId: "conv-1",
                senderId: RECIPIENT,
            }),
        );
    });

    it("sends no receipt while the conversation is still a request", async () => {
        vi.mocked(conversationRepo.findById).mockResolvedValue(
            buildConversation(ConversationStatus.PENDING),
        );

        await useCase.execute({
            conversationId: "conv-1",
            userId: RECIPIENT,
        });

        // Reading a request must not tell the stranger who sent it that
        // somebody looked - that is the signal the requests tab withholds.
        expect(conversationRepo.markRead).toHaveBeenCalled();
        expect(realtimeSvc.emitToUser).not.toHaveBeenCalled();
    });

    it("hides a conversation the reader is not part of", async () => {
        await expect(
            useCase.execute({
                conversationId: "conv-1",
                userId: "cccc-3333",
            }),
        ).rejects.toThrow(ConversationNotFoundError);
    });
});
