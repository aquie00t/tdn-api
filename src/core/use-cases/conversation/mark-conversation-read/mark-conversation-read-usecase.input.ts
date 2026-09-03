/**
 * Input for marking a thread read.
 */
export interface MarkConversationReadUseCaseInput {
    /** The conversation being opened. */
    conversationId: string;

    /** The participant who read it. */
    userId: string;
}
