import { Conversation } from "@core/domain/entities/conversation.entity";
import { ConversationStatus } from "@core/domain/enums";
import { InvalidRecipientError } from "@core/errors";
import type { IConversationRepository } from "@core/ports/repositories/conversation.repository";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { StartConversationUseCaseInput } from "./start-conversation-usecase.input";

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
     */
    constructor(
        private readonly conversationRepository: IConversationRepository,
        private readonly userRepository: IUserRepository,
        private readonly followUserRepository: IFollowRepository,
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
     * @returns The conversation, new or existing
     *
     * @throws InvalidRecipientError - When the recipient is the initiator, a
     * bot, or an account being deleted
     */
    async execute(input: StartConversationUseCaseInput): Promise<Conversation> {
        const { initiatorId, recipientId } = input;

        if (initiatorId === recipientId) {
            throw new InvalidRecipientError(
                "You cannot start a conversation with yourself.",
            );
        }

        const existing = await this.conversationRepository.findBetween(
            initiatorId,
            recipientId,
        );

        // A declined conversation is returned as it is rather than reopened.
        // Resetting it here would make declining pointless: the refused
        // account only has to tap "message" again to get a fresh request.
        if (existing) return existing;

        const recipient = await this.userRepository.findById(recipientId);

        // The three rejections share one error on purpose. Distinguishing a
        // bot from a deleted account from one that never existed would turn
        // this endpoint into a way to probe the user table.
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

        return await this.conversationRepository.create(conversation);
    }
}
