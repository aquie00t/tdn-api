import { ChatEvents } from "@core/domain/constants/chat-events.constants";
import type { Conversation } from "@core/domain/entities/conversation.entity";
import { Message } from "@core/domain/entities/message.entity";
import {
    ConversationStatus,
    MediaChannel,
    MediaOwnerKind,
} from "@core/domain/enums";
import {
    ConversationNotFoundError,
    EmptyMessageError,
    MediaNotOwnedError,
    MessageNotSendableError,
} from "@core/errors";
import type { IConversationRepository } from "@core/ports/repositories/conversation.repository";
import type { IMediaAssetRepository } from "@core/ports/repositories/media-asset.repository";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import type { TransactionPort } from "@core/ports/services/transaction.port";
import { resolveAttachableMedia } from "@core/use-cases/shared/media/resolve-attachable-media";
import type { SendMessageUseCaseInput } from "./send-message-usecase.input";

/**
 * Use case for writing a message into a conversation.
 *
 * Media gets the same treatment it gets on a post: every submitted URL has to
 * resolve back to an asset this sender uploaded through the message channel
 * and that moderation did not reject. Skipping that here would make the whole
 * pipeline decorative, because the request body accepts arbitrary URLs and a
 * private thread is a perfectly good place to deliver one.
 */
export class SendMessageUseCase {
    /**
     * Creates a new SendMessageUseCase instance.
     *
     * @param transactionService - Service for handling database transactions
     * @param conversationRepository - Repository the conversation is read from
     * @param mediaAssetRepository - Repository the submitted media keys are checked against
     * @param realtimeService - Service for delivering the message live
     * @param r2PublicUrl - CDN origin media URLs are served from, used to
     * recover the storage key behind a submitted URL
     */
    constructor(
        private readonly transactionService: TransactionPort,
        private readonly conversationRepository: IConversationRepository,
        private readonly mediaAssetRepository: IMediaAssetRepository,
        private readonly realtimeService: RealtimePort,
        private readonly r2PublicUrl: string,
    ) {}

    /**
     * Writes a message and delivers it.
     *
     * @param input - The conversation, the sender, the text and any media
     * @returns The stored message
     *
     * @throws ConversationNotFoundError - When the conversation does not
     * exist, or the sender is not a participant
     * @throws MessageNotSendableError - When the conversation is declined, or
     * the sender is the recipient of a request they have not accepted
     * @throws EmptyMessageError - When the message carries neither text nor media
     * @throws MediaNotOwnedError - When a submitted URL is not one this sender
     * uploaded for a message, or was rejected by moderation
     */
    async execute(input: SendMessageUseCaseInput): Promise<Message> {
        const conversation = await this.conversationRepository.findById(
            input.conversationId,
        );

        if (!conversation || !conversation.includes(input.senderId)) {
            throw new ConversationNotFoundError();
        }

        if (!conversation.canSend(input.senderId)) {
            throw new MessageNotSendableError();
        }

        const content = (input.content ?? "").trim();
        const mediaUrls = input.mediaUrls ?? [];

        if (content.length === 0 && mediaUrls.length === 0) {
            throw new EmptyMessageError();
        }

        const media = await resolveAttachableMedia({
            mediaUrls,
            uploaderId: input.senderId,
            channel: MediaChannel.MESSAGE_MEDIA,
            cdnBaseUrl: this.r2PublicUrl,
            mediaAssetRepository: this.mediaAssetRepository,
        });

        const recipientId = conversation.otherParticipantId(input.senderId);

        const saved = await this.transactionService.runInTransaction(
            async (ctx) => {
                const message = await ctx.messageRepository.create(
                    Message.create({
                        conversationId: conversation.id,
                        senderId: input.senderId,
                        content,
                        // The submitted URLs are stored, not the storage keys
                        // behind them: that is the shape posts and comments
                        // already hold, and it is what the moderation worker
                        // writes back when a video's verdict lands.
                        mediaUrls,
                        isSensitive: media.isSensitive,
                        mediaStatus: media.mediaStatus,
                    }),
                );

                if (media.storageKeys.length > 0) {
                    // The attach is the atomic claim, not the resolve above
                    // it: two requests carrying the same key both pass that
                    // check, and only one can come back with every row
                    // written.
                    const attached =
                        await ctx.mediaAssetRepository.attachToOwner(
                            media.storageKeys,
                            MediaOwnerKind.MESSAGE,
                            message.id,
                        );

                    if (attached !== media.storageKeys.length) {
                        throw new MediaNotOwnedError();
                    }
                }

                await ctx.conversationRepository.applyNewMessage(
                    conversation.id,
                    {
                        recipientId,
                        sentAt: message.createdAt,
                        preview: message.preview(),
                    },
                );

                return message;
            },
        );

        this.emit(conversation, saved, recipientId);

        return saved;
    }

    /**
     * Pushes the new message to the recipient.
     *
     * A message in a still-pending conversation is announced as a request
     * rather than as a message, so the client can file it in the requests tab
     * without raising the unread badge. That distinction is the whole point of
     * having requests: an account the recipient never asked to hear from must
     * not be able to interrupt them.
     *
     * Delivery happens after the transaction commits. A push emitted inside it
     * would announce a message a rollback then took away, and the client has
     * no way to unreceive one.
     *
     * @param conversation - The conversation as it was before the write
     * @param message - The stored message
     * @param recipientId - The participant being told about it
     */
    private emit(
        conversation: Conversation,
        message: Message,
        recipientId: string,
    ): void {
        const event =
            conversation.status === ConversationStatus.PENDING
                ? ChatEvents.CONVERSATION_REQUEST
                : ChatEvents.MESSAGE_NEW;

        this.realtimeService.emitToUser(recipientId, event, {
            conversationId: conversation.id,
            messageId: message.id,
            senderId: message.senderId,
            preview: message.preview(),
            hasMedia: message.mediaUrls.length > 0,
            createdAt: message.createdAt.toISOString(),
        });
    }
}
