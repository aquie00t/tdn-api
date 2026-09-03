/**
 * Payload structure for realtime notifications.
 */
export interface RealtimeNotificationPayload {
    /** The type of notification event. */
    type: string;

    /** The ID of the user who triggered the event. */
    issuerId: string;

    /** Optional message content for the notification. */
    message?: string;

    /** Optional post ID related to the notification. */
    postId?: string;

    commentId?: string;

    /** Article the notification points at, when it concerns an article */
    articleId?: string;

    /** Slug of that article, so the client can build its URL without a lookup */
    articleSlug?: string;

    /** Identifier of the resource the client should deep-link to */
    referenceId?: string;
}

/**
 * Payload structure for realtime chat events.
 *
 * Chat has nothing to say about issuers and reference ids, and a notification
 * has nothing to say about conversations, so the two shapes stay separate
 * rather than growing into one struct where most fields are always absent.
 */
export interface RealtimeChatPayload {
    /** The conversation the event concerns. */
    conversationId: string;

    /** The message the event concerns, absent for a read receipt. */
    messageId?: string;

    /** Who wrote the message, or who read the thread. */
    senderId: string;

    /** Truncated message text, so an inbox can update without a refetch. */
    preview?: string;

    /** Whether the message carries attachments the client must fetch. */
    hasMedia?: boolean;

    /** When the message was written, as an ISO string. */
    createdAt?: string;

    /** When the thread was read, as an ISO string. */
    readAt?: string;
}

/**
 * Anything that can travel over the realtime channel.
 *
 * A union rather than a widened interface: each event still has to produce a
 * payload that is completely one shape or completely the other, which is what
 * keeps a chat event from being emitted with half a notification's fields.
 */
export type RealtimeEventPayload =
    RealtimeNotificationPayload | RealtimeChatPayload;

/**
 * Port interface for realtime communication operations.
 * Following Clean Architecture principles, this interface defines the contract
 * for realtime operations without exposing implementation details.
 */
export interface RealtimePort {
    /**
     * Emits a realtime event to a specific user.
     * @param userId - The unique identifier of the target user.
     * @param event - The event name/type.
     * @param payload - The notification payload.
     */
    emitToUser(
        userId: string,
        event: string,
        payload: RealtimeEventPayload,
    ): void;
}
