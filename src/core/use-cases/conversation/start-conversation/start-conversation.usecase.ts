import { Conversation } from "@core/domain/entities/conversation.entity";
import { ConversationStatus } from "@core/domain/enums";
import { InvalidRecipientError } from "@core/errors";
import type { IConversationRepository } from "@core/ports/repositories/conversation.repository";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { IBlockRepository } from "@core/ports/repositories/block.repository";
import type { StartConversationUseCaseInput } from "./start-conversation-usecase.input";
import type { StartConversationUseCaseOutput } from "./start-conversation-usecase.output";

/**
 * Use case for opening a direct conversation with another user.
 *
 * Idempotent: two people who already have a thread get that thread back
 * rather than a second one. That matters more than it looks, because the
 * client calls this every time somebody taps "message" on a profile.
 */
export class StartConversationUseCase {
    /**
     * Creates a new StartConversationUseCase instance.
     *
     * @param conversationRepository - Repository conversations are read from and written to
     * @param userRepository - Repository used to check the recipient can be written to
     * @param followUserRepository - Repository used to decide whether this is a request
     * @param blockRepository - Repository used to refuse a blocked recipient
     */
    constructor(
        private readonly conversationRepository: IConversationRepository,
        private readonly userRepository: IUserRepository,
        private readonly followUserRepository: IFollowRepository,
        private readonly blockRepository: IBlockRepository,
    ) {}

    /**
     * Opens a conversation, or returns the existing one.
     *
     * A thread with somebody who already follows the initiator starts
     * ACCEPTED - following is already consent to be written to. Anyone else
     * gets a PENDING request, which the recipient sees in a separate tab and
     * which raises no unread badge until they accept.
     *
     * @param input - Who is writing to whom
     * @returns The conversation, and whether this call created it
     *
     * @throws InvalidRecipientError - When the recipient is the initiator, a
     * bot, an account being deleted, or blocked in either direction
     */
    async execute(
        input: StartConversationUseCaseInput,
    ): Promise<StartConversationUseCaseOutput> {
        const { initiatorId, recipientId } = input;

        if (initiatorId === recipientId) {
            throw new InvalidRecipientError(
                "You cannot start a conversation with yourself.",
            );
        }

        // Ahead of the lookup below, not after it. A thread these two already
        // have is returned as it stands, so checking afterwards would hand a
        // blocked account the conversation it is supposed to have lost.
        const blocked = await this.blockRepository.existsBetween(
            initiatorId,
            recipientId,
        );

        if (blocked) throw new InvalidRecipientError();

        const existing = await this.conversationRepository.findBetween(
            initiatorId,
            recipientId,
        );

        // A declined conversation is returned as it is rather than reopened.
        // Resetting it here would make declining pointless: the refused
        // account only has to tap "message" again to get a fresh request.
        if (existing) return { conversation: existing, created: false };

        const recipient = await this.userRepository.findById(recipientId);

        // The rejections share one error on purpose. Distinguishing a bot from
        // a deleted account from one that never existed - or from one that
        // blocked you - would turn this endpoint into a way to probe the user
        // table.
        if (!recipient || recipient.isBot || recipient.deletedAt !== null) {
            throw new InvalidRecipientError();
        }

        const recipientFollowsInitiator =
            await this.followUserRepository.checkIsFollowing(
                recipientId,
                initiatorId,
            );

        const conversation = Conversation.create(
            initiatorId,
            recipientId,
            recipientFollowsInitiator
                ? ConversationStatus.ACCEPTED
                : ConversationStatus.PENDING,
        );

        return {
            conversation:
                await this.conversationRepository.create(conversation),
            created: true,
        };
    }
}
