/**
 * Input for writing a message into an existing conversation.
 */
export interface SendMessageUseCaseInput {
    /** The conversation being written to. */
    conversationId: string;

    /** The participant writing. */
    senderId: string;

    /** The message text. May be empty when media is attached. */
    content?: string;

    /**
     * CDN URLs of files uploaded through `POST /messages/media`. Every one of
     * them is resolved back to an asset this sender uploaded before it is
     * stored.
     */
    mediaUrls?: string[];
}
