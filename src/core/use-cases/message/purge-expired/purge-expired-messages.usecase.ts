import type { IConversationRepository } from "@core/ports/repositories/conversation.repository";
import type { IMessageRepository } from "@core/ports/repositories/message.repository";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { StoragePort } from "@core/ports/services/storage.port";
import { toStorageKey } from "@core/use-cases/shared/media/media-url";
import type { PurgeExpiredMessagesOutput } from "./purge-expired-messages.output";

/**
 * Rows read per pass of the loop.
 *
 * Each batch is deleted before the next is read, so this bounds how much work
 * a crash can undo rather than how much the pass does in total.
 */
const BATCH_SIZE = 500;

/**
 * Use case for deleting direct messages past the retention window.
 *
 * The platform keeps message history for a fixed period and then destroys it.
 * That is a smaller promise than encryption but a firmer one: data that is not
 * held cannot leak, be subpoenaed, or be read by whoever reaches the database
 * next. Encryption narrows who can read the history; this bounds how much
 * history there is to read.
 */
export class PurgeExpiredMessagesUseCase {
    /**
     * Creates a new instance of PurgeExpiredMessagesUseCase.
     *
     * @param messageRepository - Repository the expired messages are read from and deleted in
     * @param conversationRepository - Repository the stale previews are cleared in
     * @param storageService - Storage the attachments are removed from
     * @param logger - Service for logging operations
     * @param r2PublicUrl - CDN origin media URLs are served from, used to
     * recover the storage key behind a stored URL
     */
    constructor(
        private readonly messageRepository: IMessageRepository,
        private readonly conversationRepository: IConversationRepository,
        private readonly storageService: StoragePort,
        private readonly logger: LoggerPort,
        private readonly r2PublicUrl: string,
    ) {}

    /**
     * Removes every message older than the retention window, and its media.
     *
     * @param retentionDays - How many days of history to keep
     * @returns What the pass removed
     *
     * @remarks
     * Media is deleted before the rows are, and that order is not negotiable:
     * the URLs live on the message, so a row deleted first takes with it the
     * only record of which objects belonged to it, and those objects then sit
     * in the bucket forever with nothing left to find them by.
     *
     * The conversation previews are cleared last, once the messages they copied
     * are gone. Doing it first would leave a window where a thread reported no
     * preview while still holding the messages, which is the harmless direction
     * to fail in; doing it never would leave the opening of every expired
     * conversation readable in a row that outlives everything it summarised.
     */
    async execute(retentionDays: number): Promise<PurgeExpiredMessagesOutput> {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - retentionDays);

        let deletedMessages = 0;
        let deletedMedia = 0;
        let failedMedia = 0;

        for (;;) {
            const expired = await this.messageRepository.findExpired(
                cutoff,
                BATCH_SIZE,
            );

            if (expired.length === 0) break;

            for (const message of expired) {
                const outcome = await this.deleteMedia(
                    message.id,
                    message.mediaUrls,
                );

                deletedMedia += outcome.deleted;
                failedMedia += outcome.failed;
            }

            deletedMessages += await this.messageRepository.deleteByIds(
                expired.map((message) => message.id),
            );
        }

        const clearedConversations =
            await this.conversationRepository.clearExpiredPreviews(cutoff);

        return {
            deletedMessages,
            deletedMedia,
            failedMedia,
            clearedConversations,
        };
    }

    /**
     * Removes one message's attachments from storage.
     *
     * A failure is counted and stepped over rather than raised. Stopping the
     * pass on one unreachable object would leave every message behind it in
     * the history undeleted, which is a worse outcome than one file surviving
     * the row that named it.
     *
     * @param messageId - The message being purged, for the log line
     * @param mediaUrls - The stored URLs, absolute or bare keys
     * @returns How many objects went and how many refused
     */
    private async deleteMedia(
        messageId: string,
        mediaUrls: string[],
    ): Promise<{ deleted: number; failed: number }> {
        let deleted = 0;
        let failed = 0;

        for (const url of mediaUrls) {
            const storageKey = toStorageKey(url, this.r2PublicUrl);

            if (!storageKey) continue;

            try {
                await this.storageService.delete(storageKey);
                deleted++;
            } catch (err: unknown) {
                failed++;
                this.logger.error(
                    { err, messageId, storageKey },
                    "Failed to delete the media of an expired message",
                );
            }
        }

        return { deleted, failed };
    }
}
