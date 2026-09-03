import { ChatEvents } from "@core/domain/constants/chat-events.constants";
import { ConversationStatus } from "@core/domain/enums";
import { ConversationNotFoundError } from "@core/errors";
import type { IConversationRepository } from "@core/ports/repositories/conversation.repository";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import type { MarkConversationReadUseCaseInput } from "./mark-conversation-read-usecase.input";

/**
 * Use case for clearing a thread's unread state and telling the other side.
 */
export class MarkConversationReadUseCase {
    /**
     * Creates a new MarkConversationReadUseCase instance.
     *
     * @param conversationRepository - Repository the read watermark is written to
     * @param realtimeService - Service used to deliver the read receipt
     */
    constructor(
        private readonly conversationRepository: IConversationRepository,
        private readonly realtimeService: RealtimePort,
    ) {}

    /**
     * Marks the thread read for one participant.
     *
     * The read receipt is only sent for an accepted conversation. Opening a
     * request to look at it must not tell the stranger who sent it that
     * somebody is reading - that is exactly the signal a request tab exists to
     * withhold.
     *
     * @param input - The conversation and the participant who read it
     *
     * @throws ConversationNotFoundError - When it does not exist, or the user
     * is not a participant
     */
    async execute(input: MarkConversationReadUseCaseInput): Promise<void> {
        const conversation = await this.conversationRepository.findById(
            input.conversationId,
        );

        if (!conversation || !conversation.includes(input.userId)) {
            throw new ConversationNotFoundError();
        }

        const readAt = new Date();

        await this.conversationRepository.markRead(
            conversation,
            input.userId,
            readAt,
        );

        if (conversation.status !== ConversationStatus.ACCEPTED) return;

        this.realtimeService.emitToUser(
            conversation.otherParticipantId(input.userId),
            ChatEvents.MESSAGE_READ,
            {
                conversationId: conversation.id,
                senderId: input.userId,
                readAt: readAt.toISOString(),
            },
        );
    }
}
