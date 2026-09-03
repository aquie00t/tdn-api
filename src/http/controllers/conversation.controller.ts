import type { FastifyReply, FastifyRequest } from "fastify";
import { ConversationStatus } from "@core/domain/enums";
import { MediaLimitExceededError, NoMediaProvidedError } from "@core/errors";
import type { StartConversationUseCase } from "@core/use-cases/conversation/start-conversation";
import type { ListConversationsUseCase } from "@core/use-cases/conversation/list-conversations";
import type { RespondToRequestUseCase } from "@core/use-cases/conversation/respond-to-request";
import type { MarkConversationReadUseCase } from "@core/use-cases/conversation/mark-conversation-read";
import type { GetUnreadMessageCountUseCase } from "@core/use-cases/conversation/get-unread-count";
import type { SendMessageUseCase } from "@core/use-cases/message/send-message";
import type { GetMessagesUseCase } from "@core/use-cases/message/get-messages";
import type { DeleteMessageUseCase } from "@core/use-cases/message/delete-message";
import type { UploadMessageMediaUseCase } from "@core/use-cases/message/upload-message-media";
import { ConversationPrismaMapper } from "@infrastructure/persistence/mappers/conversation-prisma.mapper";
import { MessagePrismaMapper } from "@infrastructure/persistence/mappers/message-prisma.mapper";
import type {
    ConversationIdParams,
    GetConversationsQuery,
    StartConversationBody,
} from "@typings/schemas/conversation/conversation.schema";
import type {
    GetMessagesQuery,
    MessageIdParams,
    SendMessageBody,
} from "@typings/schemas/conversation/message.schema";
import { MAX_MESSAGE_MEDIA } from "@typings/schemas/conversation/message.schema";

/**
 * Controller for direct conversations and the messages inside them.
 *
 * Thin by design: it reads the authenticated user and the validated body, and
 * hands the mapped result back. Every rule about who may write to whom lives
 * in the use cases.
 */
export class ConversationController {
    /**
     * Creates a new ConversationController instance.
     *
     * @param startConversationUseCase - Opens a conversation with another user
     * @param listConversationsUseCase - Reads one tab of the inbox
     * @param respondToRequestUseCase - Accepts or declines a request
     * @param markConversationReadUseCase - Clears a thread's unread state
     * @param getUnreadMessageCountUseCase - Reads the unread badge
     * @param sendMessageUseCase - Writes a message
     * @param getMessagesUseCase - Reads a thread
     * @param deleteMessageUseCase - Withdraws a message
     * @param uploadMessageMediaUseCase - Stores a file for a message
     */
    constructor(
        private readonly startConversationUseCase: StartConversationUseCase,
        private readonly listConversationsUseCase: ListConversationsUseCase,
        private readonly respondToRequestUseCase: RespondToRequestUseCase,
        private readonly markConversationReadUseCase: MarkConversationReadUseCase,
        private readonly getUnreadMessageCountUseCase: GetUnreadMessageCountUseCase,
        private readonly sendMessageUseCase: SendMessageUseCase,
        private readonly getMessagesUseCase: GetMessagesUseCase,
        private readonly deleteMessageUseCase: DeleteMessageUseCase,
        private readonly uploadMessageMediaUseCase: UploadMessageMediaUseCase,
    ) {}

    /**
     * Lists one tab of the caller's inbox.
     */
    async getConversations(
        request: FastifyRequest<{ Querystring: GetConversationsQuery }>,
        reply: FastifyReply,
    ): Promise<void> {
        const {
            status = ConversationStatus.ACCEPTED,
            limit = 20,
            cursor,
        } = request.query;
        const userId = request.user.id;

        const result = await this.listConversationsUseCase.execute({
            userId,
            status,
            limit,
            cursor,
        });

        return reply.status(200).send({
            data: ConversationPrismaMapper.toListResponse(
                result.conversations,
                request.server.config.R2_PUBLIC_URL,
                userId,
            ),
            meta: {
                timestamp: new Date().toISOString(),
                nextCursor: result.nextCursor,
            },
        });
    }

    /**
     * Opens a conversation, or returns the one that already exists.
     */
    async startConversation(
        request: FastifyRequest<{ Body: StartConversationBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        const userId = request.user.id;

        const conversation = await this.startConversationUseCase.execute({
            initiatorId: userId,
            recipientId: request.body.recipientId,
        });

        return reply.status(201).send({
            data: ConversationPrismaMapper.toResponse(
                conversation,
                request.server.config.R2_PUBLIC_URL,
                userId,
            ),
            meta: { timestamp: new Date().toISOString() },
        });
    }

    /**
     * Reads the caller's unread message badge.
     */
    async getUnreadCount(
        request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        const count = await this.getUnreadMessageCountUseCase.execute({
            userId: request.user.id,
        });

        return reply.status(200).send({
            data: { count },
            meta: { timestamp: new Date().toISOString() },
        });
    }

    /**
     * Reads one page of a thread, newest message first.
     */
    async getMessages(
        request: FastifyRequest<{
            Params: ConversationIdParams;
            Querystring: GetMessagesQuery;
        }>,
        reply: FastifyReply,
    ): Promise<void> {
        const { limit = 30, cursor } = request.query;
        const userId = request.user.id;

        const result = await this.getMessagesUseCase.execute({
            conversationId: request.params.id,
            userId,
            limit,
            cursor,
        });

        return reply.status(200).send({
            data: {
                conversation: ConversationPrismaMapper.toResponse(
                    result.conversation,
                    request.server.config.R2_PUBLIC_URL,
                    userId,
                ),
                messages: MessagePrismaMapper.toListResponse(
                    result.messages,
                    userId,
                ),
            },
            meta: {
                timestamp: new Date().toISOString(),
                nextCursor: result.nextCursor,
            },
        });
    }

    /**
     * Writes a message into a conversation.
     */
    async sendMessage(
        request: FastifyRequest<{
            Params: ConversationIdParams;
            Body: SendMessageBody;
        }>,
        reply: FastifyReply,
    ): Promise<void> {
        const userId = request.user.id;

        const message = await this.sendMessageUseCase.execute({
            conversationId: request.params.id,
            senderId: userId,
            content: request.body.content,
            mediaUrls: request.body.mediaUrls,
        });

        return reply.status(201).send({
            data: MessagePrismaMapper.toResponse(message, userId),
            meta: { timestamp: new Date().toISOString() },
        });
    }

    /**
     * Marks a thread read for the caller.
     */
    async markAsRead(
        request: FastifyRequest<{ Params: ConversationIdParams }>,
        reply: FastifyReply,
    ): Promise<void> {
        await this.markConversationReadUseCase.execute({
            conversationId: request.params.id,
            userId: request.user.id,
        });

        return reply.status(204).send();
    }

    /**
     * Accepts a pending conversation request.
     */
    async acceptRequest(
        request: FastifyRequest<{ Params: ConversationIdParams }>,
        reply: FastifyReply,
    ): Promise<void> {
        return await this.respond(request, reply, true);
    }

    /**
     * Declines a pending conversation request.
     */
    async declineRequest(
        request: FastifyRequest<{ Params: ConversationIdParams }>,
        reply: FastifyReply,
    ): Promise<void> {
        return await this.respond(request, reply, false);
    }

    /**
     * Withdraws one of the caller's own messages.
     */
    async deleteMessage(
        request: FastifyRequest<{ Params: MessageIdParams }>,
        reply: FastifyReply,
    ): Promise<void> {
        await this.deleteMessageUseCase.execute({
            messageId: request.params.id,
            userId: request.user.id,
        });

        return reply.status(204).send();
    }

    /**
     * Stores files to be attached to a message.
     *
     * Mirrors the post media endpoint, but on its own channel: the channel is
     * fixed here, at the moment the bytes arrive, which is what keeps a file
     * uploaded for a private conversation out of a public post.
     */
    async uploadMedia(
        request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        if (!request.isMultipart()) {
            throw new NoMediaProvidedError(
                "Please send a multipart/form-data request with at least one media file.",
            );
        }

        const userId = request.user.id;
        const cdnUrl = request.server.config.R2_PUBLIC_URL.replace(/\/+$/, "");

        const uploadedUrls: string[] = [];
        let fileCount = 0;

        for await (const part of request.files()) {
            fileCount++;

            if (fileCount > MAX_MESSAGE_MEDIA) {
                throw new MediaLimitExceededError();
            }

            const fileBuffer = await part.toBuffer();

            // The client's MIME type and file name are deliberately not passed
            // on: both are attacker-controlled, and the use case reads the
            // format out of the bytes instead.
            const storageKey = await this.uploadMessageMediaUseCase.execute({
                userId,
                fileBuffer,
                truncated: part.file.truncated,
            });

            uploadedUrls.push(`${cdnUrl}/${storageKey}`);
        }

        if (uploadedUrls.length === 0) {
            throw new NoMediaProvidedError();
        }

        return reply.status(200).send({
            data: { mediaUrls: uploadedUrls },
            meta: { timestamp: new Date().toISOString() },
        });
    }

    /**
     * Shared body of accept and decline.
     *
     * @param request - The request carrying the conversation id
     * @param reply - The reply to send the updated conversation on
     * @param accept - True to accept, false to decline
     */
    private async respond(
        request: FastifyRequest<{ Params: ConversationIdParams }>,
        reply: FastifyReply,
        accept: boolean,
    ): Promise<void> {
        const userId = request.user.id;

        const conversation = await this.respondToRequestUseCase.execute({
            conversationId: request.params.id,
            userId,
            accept,
        });

        return reply.status(200).send({
            data: ConversationPrismaMapper.toResponse(
                conversation,
                request.server.config.R2_PUBLIC_URL,
                userId,
            ),
            meta: { timestamp: new Date().toISOString() },
        });
    }
}
