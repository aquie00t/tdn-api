import type { Conversation } from "@core/domain/entities/conversation.entity";
import { ConversationStatus } from "@core/domain/enums";
import {
    ConversationNotFoundError,
    MessageNotSendableError,
} from "@core/errors";
import type { IConversationRepository } from "@core/ports/repositories/conversation.repository";
import type { IBlockRepository } from "@core/ports/repositories/block.repository";
import { assertConversationVisible } from "@core/use-cases/shared/blocking/assert-conversation-visible";
import type { RespondToRequestUseCaseInput } from "./respond-to-request-usecase.input";

/**
 * Use case for accepting or declining a conversation request.
 */
export class RespondToRequestUseCase {
    /**
     * Creates a new RespondToRequestUseCase instance.
     *
     * @param conversationRepository - Repository the conversation is read from and updated in
     * @param blockRepository - Repository used to hide a blocked thread
     */
    constructor(
        private readonly conversationRepository: IConversationRepository,
        private readonly blockRepository: IBlockRepository,
    ) {}

    /**
     * Answers a pending request.
     *
     * A declined conversation keeps its row rather than being deleted. Deleting
     * it would let the refused account open a brand new request immediately,
     * which makes declining a gesture rather than a decision.
     *
     * @param input - The conversation, the responder, and their answer
     * @returns The conversation in its new state
     *
     * @throws ConversationNotFoundError - When it does not exist, the
     * responder is not a participant, or a block stands between the two
     * @throws MessageNotSendableError - When the responder is the initiator,
     * or the request has already been answered
     */
    async execute(input: RespondToRequestUseCaseInput): Promise<Conversation> {
        const conversation = await this.conversationRepository.findById(
            input.conversationId,
        );

        if (!conversation || !conversation.includes(input.userId)) {
            throw new ConversationNotFoundError();
        }

        await assertConversationVisible({
            blockRepository: this.blockRepository,
            conversation,
            viewerId: input.userId,
        });

        if (!conversation.canRespond(input.userId)) {
            throw new MessageNotSendableError(
                "This conversation is not waiting for your response.",
            );
        }

        const status = input.accept
            ? ConversationStatus.ACCEPTED
            : ConversationStatus.DECLINED;

        await this.conversationRepository.updateStatus(conversation.id, status);

        const updated = await this.conversationRepository.findById(
            conversation.id,
        );

        // The row was just written inside this request, so it is there. The
        // guard exists so the return type does not have to be nullable for a
        // case the caller cannot act on.
        if (!updated) throw new ConversationNotFoundError();

        return updated;
    }
}
