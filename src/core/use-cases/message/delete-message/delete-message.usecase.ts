import { ChatEvents } from "@core/domain/constants/chat-events.constants";
import { MediaOwnerKind } from "@core/domain/enums";
import { ConversationNotFoundError, ForbiddenError } from "@core/errors";
import type { IConversationRepository } from "@core/ports/repositories/conversation.repository";
import type { IMediaAssetRepository } from "@core/ports/repositories/media-asset.repository";
import type { IMessageRepository } from "@core/ports/repositories/message.repository";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import type { StoragePort } from "@core/ports/services/storage.port";
import { toStorageKey } from "@core/use-cases/shared/media/media-url";
import type { DeleteMessageUseCaseInput } from "./delete-message-usecase.input";

/**
 * Use case for withdrawing a message you sent.
 */
export class DeleteMessageUseCase {
    /**
     * Creates a new DeleteMessageUseCase instance.
     *
     * @param messageRepository - Repository the message is read from and withdrawn in
     * @param conversationRepository - Repository used to resolve the other participant
     * @param realtimeService - Service used to tell the other side
     * @param storageService - Storage the attachments are removed from
     * @param mediaAssetRepository - Repository the attachment records are detached in
     * @param logger - Service for logging operations
     * @param r2PublicUrl - CDN origin media URLs are served from, used to
     * recover the storage key behind a stored URL
     */
    constructor(
        private readonly messageRepository: IMessageRepository,
        private readonly conversationRepository: IConversationRepository,
        private readonly realtimeService: RealtimePort,
        private readonly storageService: StoragePort,
        private readonly mediaAssetRepository: IMediaAssetRepository,
        private readonly logger: LoggerPort,
        private readonly r2PublicUrl: string,
    ) {}

    /**
     * Withdraws a message, leaving a tombstone in the thread.
     *
     * Soft delete rather than a real one: the other side may have replied to
     * it, and removing the row outright would leave that reply answering
     * nothing. The conversation's preview is deliberately not rewritten - it
     * is a cache of what was said, and recomputing it here would mean a second
     * query on every delete for a line that the next message overwrites anyway.
     *
     * What the row keeps is its place, not its contents. The text is blanked
     * by the repository and the attachments are removed from storage here, so
     * "delete" means the thing it says rather than "hide from the API" - which
     * is what it used to mean, with the message sitting in the database in
     * full behind a mapper that declined to serve it.
     *
     * @param input - The message and the user withdrawing it
     *
     * @throws ConversationNotFoundError - When the message does not exist, or
     * the conversation around it is gone
     * @throws ForbiddenError - When the user did not send it
     */
    async execute(input: DeleteMessageUseCaseInput): Promise<void> {
        const message = await this.messageRepository.findById(input.messageId);

        if (!message) throw new ConversationNotFoundError("Message not found.");

        if (!message.belongsTo(input.userId)) {
            throw new ForbiddenError("You can only delete your own messages.");
        }

        if (message.isDeleted) return;

        // Before the row is rewritten, not after: `softDelete` clears the media
        // list, and once it has there is nothing left naming these objects.
        await this.deleteAttachments(message.id, message.mediaUrls);

        await this.messageRepository.softDelete(message.id, new Date());

        // The objects are gone, so the rows that recorded them should stop
        // pointing at a message that no longer claims them. Detaching rather
        // than deleting keeps this consistent with how the moderation worker
        // releases assets.
        await this.mediaAssetRepository.detachFromOwner(
            MediaOwnerKind.MESSAGE,
            message.id,
        );

        const conversation = await this.conversationRepository.findById(
            message.conversationId,
        );

        if (!conversation) return;

        this.realtimeService.emitToUser(
            conversation.otherParticipantId(input.userId),
            ChatEvents.MESSAGE_DELETED,
            {
                conversationId: conversation.id,
                messageId: message.id,
                senderId: input.userId,
            },
        );
    }

    /**
     * Removes a withdrawn message's attachments from storage.
     *
     * Failures are logged and stepped over rather than raised. A file the
     * bucket has already lost, or a storage blip, must not leave the user
     * staring at a message they asked to delete: the row is what they see, and
     * an orphaned object is a cleanup problem rather than a broken promise to
     * them.
     *
     * @param messageId - The message being withdrawn, for the log line
     * @param mediaUrls - The stored URLs, absolute or bare keys
     */
    private async deleteAttachments(
        messageId: string,
        mediaUrls: string[],
    ): Promise<void> {
        for (const url of mediaUrls) {
            // Handles both shapes and refuses traversal, which a hand-rolled
            // prefix strip here would not.
            const storageKey = toStorageKey(url, this.r2PublicUrl);

            if (!storageKey) continue;

            try {
                await this.storageService.delete(storageKey);
            } catch (err: unknown) {
                this.logger.error(
                    { err, messageId, storageKey },
                    "Failed to delete the media of a withdrawn message",
                );
            }
        }
    }
}
