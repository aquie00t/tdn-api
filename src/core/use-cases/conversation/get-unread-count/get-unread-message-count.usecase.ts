import type { IConversationRepository } from "@core/ports/repositories/conversation.repository";
import type { GetUnreadMessageCountUseCaseInput } from "./get-unread-count-usecase.input";

/**
 * Use case for the unread-message badge.
 *
 * Deliberately separate from the notification badge: a client shows the two in
 * different places, and folding messages into notifications would make an
 * unread thread disappear the moment somebody clears their notifications.
 */
export class GetUnreadMessageCountUseCase {
    /**
     * Creates a new GetUnreadMessageCountUseCase instance.
     *
     * @param conversationRepository - Repository the counters are summed from
     */
    constructor(
        private readonly conversationRepository: IConversationRepository,
    ) {}

    /**
     * Counts a user's unread messages across their accepted conversations.
     *
     * @param input - The user whose badge is being read
     * @returns The total number of unread messages
     */
    async execute(input: GetUnreadMessageCountUseCaseInput): Promise<number> {
        return await this.conversationRepository.getTotalUnreadCount(
            input.userId,
        );
    }
}
