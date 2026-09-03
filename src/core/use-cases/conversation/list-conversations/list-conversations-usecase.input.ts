import type { ConversationStatus } from "@core/domain/enums";

/**
 * Input for reading one tab of a user's inbox.
 */
export interface ListConversationsUseCaseInput {
    /** The user whose inbox is being read. */
    userId: string;

    /** ACCEPTED for the conversation list, PENDING for the requests tab. */
    status: ConversationStatus;

    /** Most conversations to return. */
    limit: number;

    /** `nextCursor` from the previous page, if any. */
    cursor?: string;
}
