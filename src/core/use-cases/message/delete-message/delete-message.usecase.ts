import { ChatEvents } from "@core/domain/constants/chat-events.constants";
import { ConversationNotFoundError, ForbiddenError } from "@core/errors";
import type { IConversationRepository } from "@core/ports/repositories/conversation.repository";
import type { IMessageRepository } from "@core/ports/repositories/message.repository";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import type { DeleteMessageUseCaseInput } from "./delete-message-usecase.input";

/**
 * Use case for withdrawing a message you sent.
 */
export class DeleteMessageUseCase {
    /**
     * Creates a new DeleteMessageUseCase instance.
     *
     * @param messageRepository - Repository the message is read from and withdrawn in
     * @param conversationRepository - Repository used to resolve the other participant
     * @param realtimeService - Service used to tell the other side
     */
    constructor(
        private readonly messageRepository: IMessageRepository,
        private readonly conversationRepository: IConversationRepository,
        private readonly realtimeService: RealtimePort,
    ) {}

    /**
     * Withdraws a message, leaving a tombstone in the thread.
     *
     * Soft delete rather than a real one: the other side may have replied to
     * it, and removing the row outright would leave that reply answering
     * nothing. The conversation's preview is deliberately not rewritten - it
     * is a cache of what was said, and recomputing it here would mean a second
     * query on every delete for a line that the next message overwrites anyway.
     *
     * @param input - The message and the user withdrawing it
     *
     * @throws ConversationNotFoundError - When the message does not exist, or
     * the conversation around it is gone
     * @throws ForbiddenError - When the user did not send it
     */
    async execute(input: DeleteMessageUseCaseInput): Promise<void> {
        const message = await this.messageRepository.findById(input.messageId);

        if (!message) throw new ConversationNotFoundError("Message not found.");

        if (!message.belongsTo(input.userId)) {
            throw new ForbiddenError("You can only delete your own messages.");
        }

        if (message.isDeleted) return;

        await this.messageRepository.softDelete(message.id, new Date());

        const conversation = await this.conversationRepository.findById(
            message.conversationId,
        );

        if (!conversation) return;

        this.realtimeService.emitToUser(
            conversation.otherParticipantId(input.userId),
            ChatEvents.MESSAGE_DELETED,
            {
                conversationId: conversation.id,
                messageId: message.id,
                senderId: input.userId,
            },
        );
    }
}
