/**
 * Input for reading one page of a thread.
 */
export interface GetMessagesUseCaseInput {
    /** The conversation being read. */
    conversationId: string;

    /** The participant reading it. */
    userId: string;

    /** Most messages to return. */
    limit: number;

    /** `nextCursor` from the previous page, if any. */
    cursor?: string;
}
