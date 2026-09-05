import type { Conversation } from "@core/domain/entities/conversation.entity";
import type { ConversationStatus } from "@core/domain/enums";

/**
 * Parameters for listing a user's inbox.
 *
 * Paginated by cursor rather than by page number: the list is ordered by the
 * newest message, so it reorders itself while it is being read and a page
 * offset would skip or repeat threads.
 */
export interface ListConversationsInput {
    /** The user whose inbox is being read. */
    userId: string;

    /**
     * Which tab is being read: ACCEPTED for the conversation list, PENDING
     * for the requests tab. DECLINED is never listed.
     */
    status: ConversationStatus;

    /** Most conversations to return. */
    limit: number;

    /**
     * Opaque keyset cursor from the previous page, encoding both halves of
     * the sort key. A cursor that cannot be decoded is treated as absent.
     */
    cursor?: string;

    /**
     * Participants whose threads must not appear - the accounts this viewer
     * has blocked, and those who blocked them.
     *
     * Applied in the query rather than by the caller filtering the result.
     * The inbox pages by fetching one row more than it needs and using the
     * overflow to decide whether there is a next page; dropping rows after
     * that read would return short pages and report `hasMore` against a count
     * that no longer describes them.
     */
    excludeUserIds?: string[];
}

/**
 * What a newly written message changes about its conversation.
 */
export interface ApplyNewMessageInput {
    /** The participant who did not send it, whose unread count goes up. */
    recipientId: string;

    /** When the message was written. */
    sentAt: Date;

    /** Truncated text for the inbox list, empty for a media-only message. */
    preview: string;
}

/**
 * Repository interface for managing Conversation entities.
 *
 * Implementations own the ordered-pair storage detail: callers pass two user
 * ids in whatever order they have them, and the repository is responsible for
 * mapping that onto the row.
 */
export interface IConversationRepository {
    /**
     * Retrieves a conversation by its id.
     *
     * Membership is deliberately not checked here - the caller has to decide
     * whether a non-participant gets a 404 or something else - but every
     * current caller answers that with {@link Conversation.includes}.
     *
     * @param id - The conversation's id
     * @returns The conversation, or null when none exists
     */
    findById(id: string): Promise<Conversation | null>;

    /**
     * Retrieves the conversation between two users, in either direction.
     *
     * @param firstUserId - One participant
     * @param secondUserId - The other participant
     * @returns The conversation, or null when they have never talked
     */
    findBetween(
        firstUserId: string,
        secondUserId: string,
    ): Promise<Conversation | null>;

    /**
     * Persists a newly opened conversation.
     *
     * Must be idempotent on the participant pair. Two people writing to each
     * other at the same moment both find no conversation and both try to
     * create one; without that guarantee the second request fails on the
     * unique constraint instead of joining the thread the first one opened.
     *
     * @param conversation - The conversation to store
     * @returns The stored conversation - the existing one when the pair
     * already had a thread
     */
    create(conversation: Conversation): Promise<Conversation>;

    /**
     * Lists one tab of a user's inbox, newest message first.
     *
     * @param input - The viewer, the tab, and where to resume
     * @returns The conversations on this page
     */
    listForUser(input: ListConversationsInput): Promise<Conversation[]>;

    /**
     * Moves a conversation to a new status.
     *
     * @param id - The conversation's id
     * @param status - The status to move it to
     */
    updateStatus(id: string, status: ConversationStatus): Promise<void>;

    /**
     * Records that a message was written: bumps the recipient's unread count
     * and refreshes the inbox ordering and preview.
     *
     * Runs in the same transaction as the message insert. A conversation whose
     * preview and counter were written outside it would advertise a message
     * that a rollback took away.
     *
     * @param id - The conversation's id
     * @param input - The recipient, the timestamp and the preview
     */
    applyNewMessage(id: string, input: ApplyNewMessageInput): Promise<void>;

    /**
     * Clears one participant's unread count and moves their read watermark.
     *
     * Takes the loaded conversation rather than an id because the caller has
     * already read it to check membership, and the row carries the two things
     * the write needs: which side the reader sits on, and how many messages
     * they were shown as unread.
     *
     * That second number is what keeps the write from swallowing a message.
     * Assigning zero would clobber a `applyNewMessage` increment that commits
     * between the read and this write - the message would arrive already
     * marked read. Taking away only what the reader actually saw leaves such a
     * message counted.
     *
     * @param conversation - The conversation as the reader loaded it
     * @param userId - The participant who read it
     * @param readAt - When they read it
     * @returns True when a row was updated, false when the user is not a
     * participant or another read already overtook this one
     */
    markRead(
        conversation: Conversation,
        userId: string,
        readAt: Date,
    ): Promise<boolean>;

    /**
     * Sums a user's unread messages across every accepted conversation.
     *
     * Requests are excluded on purpose: an unanswered request must not light
     * up the message badge, or an open inbox becomes a way to demand
     * attention from a stranger.
     *
     * @param userId - The user whose badge is being read
     * @param excludeUserIds - Participants whose threads must not be counted,
     * so a blocked thread stops raising the badge it can no longer be opened
     * from
     * @returns The total number of unread messages
     */
    getTotalUnreadCount(
        userId: string,
        excludeUserIds?: string[],
    ): Promise<number>;
}
