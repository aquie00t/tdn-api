import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetMessagesUseCase } from "@core/use-cases/message/get-messages/get-messages.usecase";
import { Conversation } from "@core/domain/entities/conversation.entity";
import { Message } from "@core/domain/entities/message.entity";
import { ConversationStatus, MediaModerationStatus } from "@core/domain/enums";
import { ConversationNotFoundError } from "@core/errors";
import { decodeKeysetCursor } from "@core/use-cases/shared/pagination/keyset-cursor";
import type { IConversationRepository } from "@core/ports/repositories/conversation.repository";
import type { IMessageRepository } from "@core/ports/repositories/message.repository";

const READER = "aaaa-1111";
const OTHER = "bbbb-2222";

const buildMessage = (id: string, minutesAgo: number): Message =>
    Message.with({
        id,
        conversationId: "conv-1",
        senderId: READER,
        content: id,
        mediaUrls: [],
        isSensitive: false,
        mediaStatus: MediaModerationStatus.APPROVED,
        deletedAt: null,
        createdAt: new Date(Date.now() - minutesAgo * 60_000),
    });

describe("GetMessagesUseCase", () => {
    let useCase: GetMessagesUseCase;
    let conversationRepo: Pick<IConversationRepository, "findById">;
    let messageRepo: Pick<IMessageRepository, "listByConversation">;

    beforeEach(() => {
        conversationRepo = {
            findById: vi.fn().mockResolvedValue(
                Conversation.with({
                    id: "conv-1",
                    userAId: READER,
                    userBId: OTHER,
                    initiatorId: READER,
                    status: ConversationStatus.ACCEPTED,
                    userAUnread: 0,
                    userBUnread: 0,
                }),
            ),
        };
        messageRepo = { listByConversation: vi.fn().mockResolvedValue([]) };

        useCase = new GetMessagesUseCase(
            conversationRepo as IConversationRepository,
            messageRepo as IMessageRepository,
        );
    });

    it("asks for one message more than the page size", async () => {
        await useCase.execute({
            conversationId: "conv-1",
            userId: READER,
            limit: 2,
        });

        // The extra row is what distinguishes "this page happened to be full"
        // from "there is more", without a second count query.
        expect(messageRepo.listByConversation).toHaveBeenCalledWith(
            expect.objectContaining({ limit: 3 }),
        );
    });

    it("trims the extra row and returns a cursor when there is more", async () => {
        const messages = [
            buildMessage("msg-1", 1),
            buildMessage("msg-2", 2),
            buildMessage("msg-3", 3),
        ];
        vi.mocked(messageRepo.listByConversation).mockResolvedValue(messages);

        const result = await useCase.execute({
            conversationId: "conv-1",
            userId: READER,
            limit: 2,
        });

        expect(result.messages).toHaveLength(2);
        expect(decodeKeysetCursor(result.nextCursor!)).toEqual({
            timestamp: messages[1].createdAt,
            id: "msg-2",
        });
    });

    it("puts the id in the cursor so a millisecond tie can be resumed", async () => {
        // Two messages written in the same millisecond is ordinary in a live
        // thread. A cursor carrying only the timestamp would make the next
        // page skip whichever of them this page did not end on.
        const sameInstant = new Date("2026-09-03T12:00:00.000Z");
        const tied = ["msg-1", "msg-2", "msg-3"].map((id) =>
            Message.with({
                id,
                conversationId: "conv-1",
                senderId: READER,
                content: id,
                mediaUrls: [],
                isSensitive: false,
                mediaStatus: MediaModerationStatus.APPROVED,
                deletedAt: null,
                createdAt: sameInstant,
            }),
        );
        vi.mocked(messageRepo.listByConversation).mockResolvedValue(tied);

        const result = await useCase.execute({
            conversationId: "conv-1",
            userId: READER,
            limit: 2,
        });

        expect(decodeKeysetCursor(result.nextCursor!)?.id).toBe("msg-2");
    });

    it("returns no cursor at the start of the thread", async () => {
        vi.mocked(messageRepo.listByConversation).mockResolvedValue([
            buildMessage("msg-1", 1),
        ]);

        const result = await useCase.execute({
            conversationId: "conv-1",
            userId: READER,
            limit: 2,
        });

        expect(result.nextCursor).toBeNull();
    });

    it("hides a thread the reader is not part of", async () => {
        await expect(
            useCase.execute({
                conversationId: "conv-1",
                userId: "cccc-3333",
                limit: 10,
            }),
        ).rejects.toThrow(ConversationNotFoundError);
    });

    it("hides a thread that does not exist", async () => {
        vi.mocked(conversationRepo.findById).mockResolvedValue(null);

        await expect(
            useCase.execute({
                conversationId: "conv-1",
                userId: READER,
                limit: 10,
            }),
        ).rejects.toThrow(ConversationNotFoundError);
    });
});
