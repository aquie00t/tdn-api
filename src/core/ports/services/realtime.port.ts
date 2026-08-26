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
        payload: RealtimeNotificationPayload,
    ): void;
}
