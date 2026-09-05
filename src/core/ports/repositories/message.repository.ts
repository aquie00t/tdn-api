import type { Message } from "@core/domain/entities/message.entity";
import type { MediaState } from "./media-asset.repository";

/**
 * A message the retention window has passed, as the purge needs it.
 *
 * Carries the media URLs because the objects behind them have to be deleted
 * from storage before the row goes: once the row is gone there is nothing left
 * that names them, and they would sit in the bucket forever.
 */
export interface ExpiredMessage {
    id: string;
    mediaUrls: string[];
}

/**
 * Parameters for reading one page of a thread.
 *
 * Cursor-paginated for the same reason the inbox is: a thread grows while it
 * is being scrolled, and every message written during that scroll would shift
 * an offset-based page.
 */
export interface ListMessagesInput {
    /** The conversation being read. */
    conversationId: string;

    /** Most messages to return. */
    limit: number;

    /**
     * Opaque keyset cursor from the previous page, encoding both halves of
     * the sort key. A cursor that cannot be decoded is treated as absent.
     */
    cursor?: string;
}

/**
 * Repository interface for managing Message entities.
 */
export interface IMessageRepository {
    /**
     * Persists a newly written message.
     *
     * @param message - The message to store
     * @returns The stored message, with its generated id and timestamp
     */
    create(message: Message): Promise<Message>;

    /**
     * Retrieves a message by its id.
     *
     * @param id - The message's id
     * @returns The message, or null when none exists
     */
    findById(id: string): Promise<Message | null>;

    /**
     * Reads one page of a thread, newest first.
     *
     * Withdrawn messages are returned rather than filtered out: the client
     * renders them as a tombstone, and dropping them would leave a hole where
     * a reply's context used to be.
     *
     * @param input - The conversation, page size, and where to resume
     * @returns The messages on this page
     */
    listByConversation(input: ListMessagesInput): Promise<Message[]>;

    /**
     * Withdraws a message, keeping the row so the thread keeps its shape.
     *
     * Destroys what the message said. The row survives because the other side
     * may have replied to it, but the text and the media list do not: a
     * withdrawal that only hid them would leave the sender believing they had
     * deleted something they had not.
     *
     * The stored text becomes an encrypted empty string rather than a bare
     * one. A bare `""` in a column marked as ciphertext is not a valid payload
     * and would fail to decrypt on the next read.
     *
     * Removing the objects the media list named is the caller's job - this
     * only forgets where they were.
     *
     * @param id - The message's id
     * @param deletedAt - When it was withdrawn
     */
    softDelete(id: string, deletedAt: Date): Promise<void>;

    /**
     * Reads a batch of messages older than the retention window.
     *
     * Batched rather than exhaustive so a first run against a long history
     * does not hold one transaction open across the whole table.
     *
     * @param cutoff - The oldest moment a message may have been written at
     * @param limit - Most rows to return
     * @returns The expired messages, with the media that has to go with them
     */
    findExpired(cutoff: Date, limit: number): Promise<ExpiredMessage[]>;

    /**
     * Permanently deletes messages by id.
     *
     * @param ids - The messages to remove
     * @returns How many rows were deleted
     */
    deleteByIds(ids: string[]): Promise<number>;

    /**
     * Rewrites the media columns after a video's verdict arrives.
     *
     * The moderation worker owns these three fields; nothing else writes them
     * after the message is created.
     *
     * @param messageId - The message carrying the scanned media
     * @param state - The surviving URLs and the new moderation flags
     */
    updateMediaState(messageId: string, state: MediaState): Promise<void>;
}
