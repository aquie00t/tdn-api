import type { Conversation } from "@core/domain/entities/conversation.entity";
import type { Message } from "@core/domain/entities/message.entity";

/**
 * One page of a thread, with the conversation it belongs to.
 */
export interface GetMessagesUseCaseOutput {
    /**
     * The conversation itself. Returned alongside the page so opening a thread
     * is one request: the client needs the other participant and the status to
     * render the header, and would otherwise have to fetch them separately.
     */
    conversation: Conversation;

    /** The messages on this page, newest first. */
    messages: Message[];

    /** Where the next page resumes, or null at the start of the thread. */
    nextCursor: string | null;
}
