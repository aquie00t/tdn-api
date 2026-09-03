import type { Prisma } from "@generated/prisma/client";
import { Message } from "@core/domain/entities/message.entity";
import { MediaModerationStatus } from "@core/domain/enums";

export type MessageRecord = Prisma.MessageGetPayload<object>;

export interface MessageResponse {
    id: string;
    conversationId: string;
    senderId: string;

    /** The message text, empty for a media-only or withdrawn message. */
    content: string;

    /** Absolute CDN URLs, empty while the media is not cleared. */
    mediaUrls: string[];

    /** True when the client should blur the media behind a tap. */
    isSensitive: boolean;

    /** True while an attached video is stored but not yet cleared. */
    mediaPending: boolean;

    /**
     * True when moderation refused the attachments. The message still exists -
     * the client renders it as "media removed" rather than dropping it, so the
     * sender can see what happened to their own upload.
     */
    mediaRejected: boolean;

    /** True when the sender withdrew it; the client renders a tombstone. */
    isDeleted: boolean;

    /** True when the reader wrote it. */
    isMine: boolean;

    createdAt: Date;
}

/**
 * Mapper class responsible for transforming Message data across layers.
 */
export class MessagePrismaMapper {
    /**
     * Maps a Prisma record to the domain entity.
     */
    static toDomain(record: MessageRecord): Message {
        return Message.with({
            id: record.id,
            conversationId: record.conversationId,
            senderId: record.senderId,
            content: record.content,
            mediaUrls: record.mediaUrls,
            isSensitive: record.isSensitive,
            mediaStatus: record.mediaStatus as MediaModerationStatus,
            deletedAt: record.deletedAt,
            createdAt: record.createdAt,
        });
    }

    /**
     * Maps a domain entity onto the shape Prisma inserts.
     */
    static toPrismaCreate(
        message: Message,
    ): Prisma.MessageUncheckedCreateInput {
        return {
            conversationId: message.conversationId,
            senderId: message.senderId,
            content: message.content,
            mediaUrls: message.mediaUrls,
            isSensitive: message.isSensitive,
            mediaStatus: message.mediaStatus,
        };
    }

    /**
     * Maps a domain entity onto the client-facing shape.
     *
     * A withdrawn message keeps its place in the thread but gives up its
     * content: the row is retained so replies still have something to hang
     * off, not so the text can be read after it was taken back.
     *
     * @param message - The message to serialise
     * @param viewerId - The reader, used to mark their own messages
     * @returns The response body for one message
     */
    static toResponse(message: Message, viewerId: string): MessageResponse {
        const withdrawn = message.isDeleted;

        return {
            id: message.id,
            conversationId: message.conversationId,
            senderId: message.senderId,
            content: withdrawn ? "" : message.content,
            // Media that has not been cleared is withheld rather than the whole
            // message: the text is the sender's and was never in question.
            mediaUrls:
                withdrawn || !message.hasServableMedia ? [] : message.mediaUrls,
            isSensitive: message.isSensitive,
            mediaPending:
                !withdrawn &&
                (message.mediaStatus === MediaModerationStatus.PENDING ||
                    message.mediaStatus === MediaModerationStatus.SCANNING),
            mediaRejected:
                !withdrawn &&
                message.mediaStatus === MediaModerationStatus.REJECTED,
            isDeleted: withdrawn,
            isMine: message.belongsTo(viewerId),
            createdAt: message.createdAt,
        };
    }

    static toListResponse(
        messages: Message[],
        viewerId: string,
    ): MessageResponse[] {
        return messages.map((message) => this.toResponse(message, viewerId));
    }
}
