import type { Conversation } from "@core/domain/entities/conversation.entity";

/**
 * One page of a user's inbox.
 */
export interface ListConversationsUseCaseOutput {
    /** The conversations on this page, newest message first. */
    conversations: Conversation[];

    /**
     * Where the next page resumes, or null at the end of the list. Derived
     * from the last conversation returned rather than from a count, so the
     * caller never has to know how the cursor is built.
     */
    nextCursor: string | null;
}
