import type { IConversationRepository } from "@core/ports/repositories/conversation.repository";
import { encodeKeysetCursor } from "@core/use-cases/shared/pagination/keyset-cursor";
import type { ListConversationsUseCaseInput } from "./list-conversations-usecase.input";
import type { ListConversationsUseCaseOutput } from "./list-conversations-usecase.output";

/**
 * Use case for reading one tab of a user's inbox.
 *
 * The two tabs a client shows - conversations and requests - are the same
 * query with a different status, so they share one use case rather than
 * duplicating the pagination.
 */
export class ListConversationsUseCase {
    /**
     * Creates a new ListConversationsUseCase instance.
     *
     * @param conversationRepository - Repository the inbox is read from
     */
    constructor(
        private readonly conversationRepository: IConversationRepository,
    ) {}

    /**
     * Reads one page of the inbox.
     *
     * One extra row is fetched and dropped: it is what distinguishes "this
     * page happened to be full" from "there is more", without a second count
     * query against a list that is being written to.
     *
     * @param input - The viewer, the tab, and where to resume
     * @returns The page and the cursor for the next one
     */
    async execute(
        input: ListConversationsUseCaseInput,
    ): Promise<ListConversationsUseCaseOutput> {
        const page = await this.conversationRepository.listForUser({
            userId: input.userId,
            status: input.status,
            limit: input.limit + 1,
            cursor: input.cursor,
        });

        const hasMore = page.length > input.limit;
        const conversations = hasMore ? page.slice(0, input.limit) : page;

        const last = conversations.at(-1);

        // The cursor pins both halves of the sort key. `lastActivityAt` alone
        // would not identify a row: several conversations can share it to the
        // millisecond, and resuming from a timestamp would skip every one of
        // them that this page did not end on.
        const nextCursor =
            hasMore && last
                ? encodeKeysetCursor({
                      timestamp: last.lastActivityAt,
                      id: last.id,
                  })
                : null;

        return { conversations, nextCursor };
    }
}
