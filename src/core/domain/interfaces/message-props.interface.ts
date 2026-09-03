import type { MediaModerationStatus } from "../enums";

/**
 * Props interface for the Message entity.
 *
 * Media is described exactly as posts and comments describe it: raw storage
 * keys plus the two denormalised moderation columns, so the same mapper and
 * worker logic applies without a special case.
 */
export interface MessageProps {
    /** The unique identifier of the message, absent until persisted */
    id?: string;

    /** The conversation the message belongs to */
    conversationId: string;

    /** The participant who wrote it */
    senderId: string;

    /** The message text, empty for a media-only message */
    content: string;

    /** R2 object keys of the attached files, in upload order */
    mediaUrls: string[];

    /** Whether the client should blur the attachments behind a tap */
    isSensitive: boolean;

    /** Whether the attachments are cleared, still unscanned, or refused */
    mediaStatus: MediaModerationStatus;

    /** When the sender withdrew the message, null while it stands */
    deletedAt?: Date | null;

    /** Creation timestamp, absent until persisted */
    createdAt?: Date;
}
