/**
 * Input for withdrawing a message.
 */
export interface DeleteMessageUseCaseInput {
    /** The message being withdrawn. */
    messageId: string;

    /** The user withdrawing it, who must be its sender. */
    userId: string;
}
