import { describe, expect, it } from "vitest";
import { MessagePrismaMapper } from "@infrastructure/persistence/mappers/message-prisma.mapper";
import { Message } from "@core/domain/entities/message.entity";
import { MediaModerationStatus } from "@core/domain/enums";

const SENDER = "aaaa-1111";
const READER = "bbbb-2222";

const buildMessage = (
    overrides: Partial<{
        content: string;
        mediaUrls: string[];
        isSensitive: boolean;
        mediaStatus: MediaModerationStatus;
        deletedAt: Date | null;
    }> = {},
): Message =>
    Message.with({
        id: "msg-1",
        conversationId: "conv-1",
        senderId: SENDER,
        content: overrides.content ?? "hello",
        mediaUrls: overrides.mediaUrls ?? [],
        isSensitive: overrides.isSensitive ?? false,
        mediaStatus: overrides.mediaStatus ?? MediaModerationStatus.APPROVED,
        deletedAt: overrides.deletedAt ?? null,
        createdAt: new Date("2026-09-03T12:00:00.000Z"),
    });

describe("MessagePrismaMapper.toResponse", () => {
    it("serves approved media as it was stored", () => {
        const response = MessagePrismaMapper.toResponse(
            buildMessage({ mediaUrls: ["https://cdn.test/messages/a.jpg"] }),
            READER,
        );

        expect(response.mediaUrls).toEqual(["https://cdn.test/messages/a.jpg"]);
        expect(response.mediaPending).toBe(false);
        expect(response.mediaRejected).toBe(false);
    });

    it("withholds media that has no verdict yet but keeps the text", () => {
        const response = MessagePrismaMapper.toResponse(
            buildMessage({
                mediaUrls: ["https://cdn.test/messages/clip.mp4"],
                mediaStatus: MediaModerationStatus.PENDING,
            }),
            READER,
        );

        expect(response.mediaUrls).toEqual([]);
        expect(response.mediaPending).toBe(true);
        expect(response.content).toBe("hello");
    });

    it("flags refused media so the client can render a tombstone", () => {
        // The distinction that makes this worth storing: without it, a message
        // whose only attachment was refused is indistinguishable from one that
        // never carried media, and reloads as a silent empty row.
        const response = MessagePrismaMapper.toResponse(
            buildMessage({
                content: "",
                mediaUrls: [],
                mediaStatus: MediaModerationStatus.REJECTED,
            }),
            READER,
        );

        expect(response.mediaRejected).toBe(true);
        expect(response.mediaPending).toBe(false);
        expect(response.isDeleted).toBe(false);
    });

    it("gives up the text of a withdrawn message but keeps its place", () => {
        const response = MessagePrismaMapper.toResponse(
            buildMessage({
                mediaUrls: ["https://cdn.test/messages/a.jpg"],
                deletedAt: new Date(),
            }),
            READER,
        );

        expect(response.isDeleted).toBe(true);
        expect(response.content).toBe("");
        expect(response.mediaUrls).toEqual([]);
        expect(response.mediaRejected).toBe(false);
    });

    it("marks the reader's own messages", () => {
        expect(
            MessagePrismaMapper.toResponse(buildMessage(), SENDER).isMine,
        ).toBe(true);
        expect(
            MessagePrismaMapper.toResponse(buildMessage(), READER).isMine,
        ).toBe(false);
    });
});
