import { ConversationNotFoundError } from "@core/errors";
import type { IConversationRepository } from "@core/ports/repositories/conversation.repository";
import type { IMessageRepository } from "@core/ports/repositories/message.repository";
import { encodeKeysetCursor } from "@core/use-cases/shared/pagination/keyset-cursor";
import type { GetMessagesUseCaseInput } from "./get-messages-usecase.input";
import type { GetMessagesUseCaseOutput } from "./get-messages-usecase.output";

/**
 * Use case for reading a thread.
 */
export class GetMessagesUseCase {
    /**
     * Creates a new GetMessagesUseCase instance.
     *
     * @param conversationRepository - Repository the conversation is read from
     * @param messageRepository - Repository the messages are read from
     */
    constructor(
        private readonly conversationRepository: IConversationRepository,
        private readonly messageRepository: IMessageRepository,
    ) {}

    /**
     * Reads one page of a thread, newest message first.
     *
     * A non-participant gets the same error as a thread that does not exist.
     * Answering "it exists, but not for you" would let anyone confirm that two
     * particular people are talking, which for a private conversation is most
     * of what there is to leak.
     *
     * @param input - The conversation, the reader, and where to resume
     * @returns The conversation, the page, and the cursor for the next one
     *
     * @throws ConversationNotFoundError - When it does not exist, or the
     * reader is not a participant
     */
    async execute(
        input: GetMessagesUseCaseInput,
    ): Promise<GetMessagesUseCaseOutput> {
        const conversation = await this.conversationRepository.findById(
            input.conversationId,
        );

        if (!conversation || !conversation.includes(input.userId)) {
            throw new ConversationNotFoundError();
        }

        const page = await this.messageRepository.listByConversation({
            conversationId: conversation.id,
            limit: input.limit + 1,
            cursor: input.cursor,
        });

        const hasMore = page.length > input.limit;
        const messages = hasMore ? page.slice(0, input.limit) : page;

        const oldest = messages.at(-1);

        // Both halves of the sort key travel in the cursor. Two messages can
        // share a `createdAt` to the millisecond in a live thread, and
        // resuming from a timestamp alone would drop the one this page did
        // not end on.
        return {
            conversation,
            messages,
            nextCursor:
                hasMore && oldest
                    ? encodeKeysetCursor({
                          timestamp: oldest.createdAt,
                          id: oldest.id,
                      })
                    : null,
        };
    }
}
