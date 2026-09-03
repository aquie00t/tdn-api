/**
 * Input for answering a pending conversation request.
 */
export interface RespondToRequestUseCaseInput {
    /** The conversation being answered. */
    conversationId: string;

    /** The user answering, who must be the recipient of the request. */
    userId: string;

    /** True to accept, false to decline. */
    accept: boolean;
}
