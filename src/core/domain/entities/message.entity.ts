import { MediaModerationStatus } from "../enums";
import type { MessageProps } from "../interfaces/message-props.interface";

/**
 * Rich domain model for a direct message.
 *
 * Media is carried the way posts and comments carry it - storage keys plus
 * the two denormalised moderation columns - so the moderation worker can
 * write a video's verdict back here without knowing anything special about
 * conversations.
 */
export class Message {
    private constructor(private readonly props: MessageProps) {}

    /**
     * Creates a message that is about to be written.
     *
     * The moderation fields are not defaulted here: they come from resolving
     * the submitted media against the uploader's own assets, and inventing an
     * APPROVED default would let a message carry an unscanned video.
     *
     * @param params - The conversation, the author, the text and the resolved
     * media state
     * @returns A new Message entity
     */
    public static create(params: {
        conversationId: string;
        senderId: string;
        content: string;
        mediaUrls: string[];
        isSensitive: boolean;
        mediaStatus: MediaModerationStatus;
    }): Message {
        return new Message({
            conversationId: params.conversationId,
            senderId: params.senderId,
            content: params.content,
            mediaUrls: params.mediaUrls,
            isSensitive: params.isSensitive,
            mediaStatus: params.mediaStatus,
            deletedAt: null,
        });
    }

    public static with(props: MessageProps): Message {
        return new Message(props);
    }

    get id(): string {
        return this.props.id!;
    }

    get conversationId(): string {
        return this.props.conversationId;
    }

    get senderId(): string {
        return this.props.senderId;
    }

    get content(): string {
        return this.props.content;
    }

    get mediaUrls(): string[] {
        return this.props.mediaUrls;
    }

    get isSensitive(): boolean {
        return this.props.isSensitive;
    }

    get mediaStatus(): MediaModerationStatus {
        return this.props.mediaStatus;
    }

    get deletedAt(): Date | null {
        return this.props.deletedAt ?? null;
    }

    get createdAt(): Date {
        return this.props.createdAt!;
    }

    /**
     * Whether the sender has withdrawn this message.
     */
    get isDeleted(): boolean {
        return (
            this.props.deletedAt !== null && this.props.deletedAt !== undefined
        );
    }

    /**
     * Whether the read path may serve this message's attachments.
     *
     * Withholding is per-message rather than per-thread: a video still waiting
     * on a verdict must not hold back the text around it, and a refused one
     * must not come back once the rest of the thread loads.
     */
    get hasServableMedia(): boolean {
        return (
            this.props.mediaUrls.length > 0 &&
            this.props.mediaStatus === MediaModerationStatus.APPROVED
        );
    }

    /**
     * Whether the given user wrote this message.
     *
     * @param userId - The user to check
     * @returns True when they are the sender
     */
    public belongsTo(userId: string): boolean {
        return this.props.senderId === userId;
    }

    /**
     * A short preview of the message for the inbox list.
     *
     * A media-only message has no text to show, so the caller is handed an
     * empty string and decides what to render - the API has no business
     * inventing a localised "sent a photo" label.
     *
     * @param maxLength - Longest preview to produce
     * @returns The truncated text, empty when the message is media-only
     */
    public preview(maxLength = 140): string {
        const text = this.props.content.trim();

        return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
    }
}
