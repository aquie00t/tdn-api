import type { Conversation } from "@core/domain/entities/conversation.entity";
import { ConversationNotFoundError } from "@core/errors";
import type { IBlockRepository } from "@core/ports/repositories/block.repository";

/**
 * Hides a conversation whose other participant is blocked, in either
 * direction.
 *
 * Answers with {@link ConversationNotFoundError} rather than the block error
 * the rest of the feature uses. Every rejection on these endpoints already
 * collapses into one shape - a non-participant is told the thread does not
 * exist, because saying "it exists, but not for you" confirms that two
 * particular people are talking. A block that announced itself here would
 * reopen exactly that, and would also tell the blocked user which of their
 * threads went quiet.
 *
 * Nothing is deleted: lifting the block brings the thread back with its
 * status, its counters and its whole history.
 *
 * @param params - The repository to ask, the conversation, and who is reading
 *
 * @throws ConversationNotFoundError - When either participant has blocked the
 * other
 */
export async function assertConversationVisible(params: {
    blockRepository: IBlockRepository;
    conversation: Conversation;
    viewerId: string;
}): Promise<void> {
    const blocked = await params.blockRepository.existsBetween(
        params.viewerId,
        params.conversation.otherParticipantId(params.viewerId),
    );

    if (blocked) throw new ConversationNotFoundError();
}
