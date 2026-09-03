import { beforeEach, describe, expect, it, vi } from "vitest";
import { SendMessageUseCase } from "@core/use-cases/message/send-message/send-message.usecase";
import { Conversation } from "@core/domain/entities/conversation.entity";
import { Message } from "@core/domain/entities/message.entity";
import { ChatEvents } from "@core/domain/constants/chat-events.constants";
import {
    ConversationStatus,
    MediaChannel,
    MediaModerationStatus,
    MediaOwnerKind,
} from "@core/domain/enums";
import {
    ConversationNotFoundError,
    EmptyMessageError,
    MediaNotOwnedError,
    MessageNotSendableError,
} from "@core/errors";
import type { IConversationRepository } from "@core/ports/repositories/conversation.repository";
import type { IMediaAssetRepository } from "@core/ports/repositories/media-asset.repository";
import type { IMessageRepository } from "@core/ports/repositories/message.repository";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import type {
    TransactionContext,
    TransactionPort,
} from "@core/ports/services/transaction.port";
import type { MediaAsset } from "@core/domain/entities/media-asset.entity";

const CDN_URL = "https://cdn.example.com";
const SENDER = "aaaa-1111";
const RECIPIENT = "bbbb-2222";

const buildConversation = (
    status: ConversationStatus,
    initiatorId = SENDER,
): Conversation =>
    Conversation.with({
        id: "conv-1",
        ...(SENDER < RECIPIENT
            ? { userAId: SENDER, userBId: RECIPIENT }
            : { userAId: RECIPIENT, userBId: SENDER }),
        initiatorId,
        status,
        userAUnread: 0,
        userBUnread: 0,
    });

const buildAsset = (
    key: string,
    overrides: Partial<{
        uploaderId: string;
        channel: MediaChannel;
        ownerId: string | null;
        status: MediaModerationStatus;
    }> = {},
): MediaAsset => {
    const uploaderId = overrides.uploaderId ?? SENDER;
    const status = overrides.status ?? MediaModerationStatus.APPROVED;

    return {
        storageKey: key,
        channel: overrides.channel ?? MediaChannel.MESSAGE_MEDIA,
        ownerId: overrides.ownerId ?? null,
        status,
        canBeAttachedBy: (userId: string) =>
            uploaderId === userId && status !== MediaModerationStatus.REJECTED,
    } as unknown as MediaAsset;
};

describe("SendMessageUseCase", () => {
    let useCase: SendMessageUseCase;
    let transactionSvc: Pick<TransactionPort, "runInTransaction">;
    let conversationRepo: Pick<IConversationRepository, "findById">;
    let mediaAssetRepo: Pick<
        IMediaAssetRepository,
        "findByStorageKeys" | "attachToOwner"
    >;
    let realtimeSvc: Pick<RealtimePort, "emitToUser">;
    let txMessageRepo: Pick<IMessageRepository, "create">;
    let txConversationRepo: Pick<IConversationRepository, "applyNewMessage">;

    const buildTransactionContext = (): TransactionContext =>
        ({
            messageRepository: txMessageRepo as IMessageRepository,
            conversationRepository:
                txConversationRepo as IConversationRepository,
            mediaAssetRepository: mediaAssetRepo as IMediaAssetRepository,
        }) as TransactionContext;

    beforeEach(() => {
        txMessageRepo = {
            create: vi.fn().mockImplementation((message: Message) =>
                Promise.resolve(
                    Message.with({
                        id: "msg-1",
                        conversationId: message.conversationId,
                        senderId: message.senderId,
                        content: message.content,
                        mediaUrls: message.mediaUrls,
                        isSensitive: message.isSensitive,
                        mediaStatus: message.mediaStatus,
                        deletedAt: null,
                        createdAt: new Date("2026-09-03T12:00:00.000Z"),
                    }),
                ),
            ),
        };
        txConversationRepo = { applyNewMessage: vi.fn() };
        mediaAssetRepo = {
            findByStorageKeys: vi.fn().mockResolvedValue([]),
            attachToOwner: vi.fn().mockResolvedValue(1),
        };
        realtimeSvc = { emitToUser: vi.fn() };
        conversationRepo = {
            findById: vi
                .fn()
                .mockResolvedValue(
                    buildConversation(ConversationStatus.ACCEPTED),
                ),
        };
        transactionSvc = { runInTransaction: vi.fn() };

        vi.mocked(transactionSvc.runInTransaction).mockImplementation(
            async (work) => work(buildTransactionContext()),
        );

        useCase = new SendMessageUseCase(
            transactionSvc as TransactionPort,
            conversationRepo as IConversationRepository,
            mediaAssetRepo as IMediaAssetRepository,
            realtimeSvc as RealtimePort,
            CDN_URL,
        );
    });

    it("writes a text message and bumps the recipient's unread count", async () => {
        const message = await useCase.execute({
            conversationId: "conv-1",
            senderId: SENDER,
            content: "hello",
        });

        expect(message.content).toBe("hello");
        expect(txConversationRepo.applyNewMessage).toHaveBeenCalledWith(
            "conv-1",
            expect.objectContaining({
                recipientId: RECIPIENT,
                preview: "hello",
            }),
        );
    });

    it("delivers an accepted conversation's message as message:new", async () => {
        await useCase.execute({
            conversationId: "conv-1",
            senderId: SENDER,
            content: "hello",
        });

        expect(realtimeSvc.emitToUser).toHaveBeenCalledWith(
            RECIPIENT,
            ChatEvents.MESSAGE_NEW,
            expect.objectContaining({ conversationId: "conv-1" }),
        );
    });

    it("delivers a pending conversation's message as a request instead", async () => {
        vi.mocked(conversationRepo.findById).mockResolvedValue(
            buildConversation(ConversationStatus.PENDING),
        );

        await useCase.execute({
            conversationId: "conv-1",
            senderId: SENDER,
            content: "hi, can we talk",
        });

        expect(realtimeSvc.emitToUser).toHaveBeenCalledWith(
            RECIPIENT,
            ChatEvents.CONVERSATION_REQUEST,
            expect.objectContaining({ conversationId: "conv-1" }),
        );
    });

    it("refuses a message with neither text nor media", async () => {
        await expect(
            useCase.execute({
                conversationId: "conv-1",
                senderId: SENDER,
                content: "   ",
            }),
        ).rejects.toThrow(EmptyMessageError);
    });

    it("refuses a message from the recipient of an unanswered request", async () => {
        vi.mocked(conversationRepo.findById).mockResolvedValue(
            buildConversation(ConversationStatus.PENDING, RECIPIENT),
        );

        await expect(
            useCase.execute({
                conversationId: "conv-1",
                senderId: SENDER,
                content: "let me in",
            }),
        ).rejects.toThrow(MessageNotSendableError);
    });

    it("refuses a message in a declined conversation", async () => {
        vi.mocked(conversationRepo.findById).mockResolvedValue(
            buildConversation(ConversationStatus.DECLINED),
        );

        await expect(
            useCase.execute({
                conversationId: "conv-1",
                senderId: SENDER,
                content: "still here",
            }),
        ).rejects.toThrow(MessageNotSendableError);
    });

    it("refuses a message from somebody outside the conversation", async () => {
        await expect(
            useCase.execute({
                conversationId: "conv-1",
                senderId: "cccc-3333",
                content: "hello",
            }),
        ).rejects.toThrow(ConversationNotFoundError);
    });

    it("attaches resolved media to the message", async () => {
        vi.mocked(mediaAssetRepo.findByStorageKeys).mockResolvedValue([
            buildAsset("messages/aaaa-1111/photo.jpg"),
        ]);

        await useCase.execute({
            conversationId: "conv-1",
            senderId: SENDER,
            mediaUrls: [`${CDN_URL}/messages/aaaa-1111/photo.jpg`],
        });

        expect(mediaAssetRepo.attachToOwner).toHaveBeenCalledWith(
            ["messages/aaaa-1111/photo.jpg"],
            MediaOwnerKind.MESSAGE,
            "msg-1",
        );
    });

    it("refuses media somebody else uploaded", async () => {
        vi.mocked(mediaAssetRepo.findByStorageKeys).mockResolvedValue([
            buildAsset("messages/other/photo.jpg", {
                uploaderId: "cccc-3333",
            }),
        ]);

        await expect(
            useCase.execute({
                conversationId: "conv-1",
                senderId: SENDER,
                mediaUrls: [`${CDN_URL}/messages/other/photo.jpg`],
            }),
        ).rejects.toThrow(MediaNotOwnedError);
    });

    it("refuses media uploaded through the post channel", async () => {
        vi.mocked(mediaAssetRepo.findByStorageKeys).mockResolvedValue([
            buildAsset("posts/aaaa-1111/photo.jpg", {
                channel: MediaChannel.POST_MEDIA,
            }),
        ]);

        await expect(
            useCase.execute({
                conversationId: "conv-1",
                senderId: SENDER,
                mediaUrls: [`${CDN_URL}/posts/aaaa-1111/photo.jpg`],
            }),
        ).rejects.toThrow(MediaNotOwnedError);
    });

    it("refuses media that lost the race to another message", async () => {
        vi.mocked(mediaAssetRepo.findByStorageKeys).mockResolvedValue([
            buildAsset("messages/aaaa-1111/photo.jpg"),
        ]);
        vi.mocked(mediaAssetRepo.attachToOwner).mockResolvedValue(0);

        await expect(
            useCase.execute({
                conversationId: "conv-1",
                senderId: SENDER,
                mediaUrls: [`${CDN_URL}/messages/aaaa-1111/photo.jpg`],
            }),
        ).rejects.toThrow(MediaNotOwnedError);
    });

    it("stores a message carrying an unscanned video as pending", async () => {
        vi.mocked(mediaAssetRepo.findByStorageKeys).mockResolvedValue([
            buildAsset("messages/aaaa-1111/clip.mp4", {
                status: MediaModerationStatus.PENDING,
            }),
        ]);

        const message = await useCase.execute({
            conversationId: "conv-1",
            senderId: SENDER,
            mediaUrls: [`${CDN_URL}/messages/aaaa-1111/clip.mp4`],
        });

        expect(message.mediaStatus).toBe(MediaModerationStatus.PENDING);
        expect(message.hasServableMedia).toBe(false);
    });
});
