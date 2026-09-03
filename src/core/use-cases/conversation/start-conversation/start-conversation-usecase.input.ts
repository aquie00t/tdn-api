/**
 * Input for opening, or re-opening, a direct conversation.
 */
export interface StartConversationUseCaseInput {
    /** The user opening the conversation. */
    initiatorId: string;

    /** The user being written to. */
    recipientId: string;
}
