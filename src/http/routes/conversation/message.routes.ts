/**
 * Message routes module
 *
 * This module defines API endpoints for the messages inside a conversation:
 * - Reading a thread
 * - Writing a message
 * - Withdrawing one
 * - Uploading a file to attach to one
 *
 * @author TDN Team
 * @version 1.0.0
 */

import { RateLimitPolicies } from "@plugins/rate-limit.plugin";
import {
    ConversationIdParamsSchema,
    type ConversationIdParams,
} from "@typings/schemas/conversation/conversation.schema";
import {
    GetMessagesQuerySchema,
    type GetMessagesQuery,
    GetMessagesResponseSchema,
    type GetMessagesResponse,
    MessageIdParamsSchema,
    type MessageIdParams,
    MessageResponseSchema,
    type MessageResponseBody,
    SendMessageBodySchema,
    type SendMessageBody,
    UploadMessageMediaResponseSchema,
    type UploadMessageMediaResponse,
} from "@typings/schemas/conversation/message.schema";
import type { FastifyInstance } from "fastify";

/**
 * Sets up message routes on the Fastify instance
 *
 * @param fastify - The Fastify application instance
 * @returns void
 */
export function messageRoutes(fastify: FastifyInstance): void {
    const conversationController =
        fastify.diContainer.cradle.conversationController;

    fastify.get<{
        Params: ConversationIdParams;
        Querystring: GetMessagesQuery;
        Reply: { 200: GetMessagesResponse };
    }>(
        "/conversations/:id/messages",
        {
            onRequest: [fastify.authenticate],
            schema: {
                params: ConversationIdParamsSchema,
                querystring: GetMessagesQuerySchema,
                response: { 200: GetMessagesResponseSchema },
                tags: ["Conversation"],
            },
            config: { rateLimit: RateLimitPolicies.STANDARD },
        },
        conversationController.getMessages.bind(conversationController),
    );

    fastify.post<{
        Params: ConversationIdParams;
        Body: SendMessageBody;
        Reply: { 201: MessageResponseBody };
    }>(
        "/conversations/:id/messages",
        {
            onRequest: [fastify.authenticate],
            schema: {
                params: ConversationIdParamsSchema,
                body: SendMessageBodySchema,
                response: { 201: MessageResponseSchema },
                tags: ["Conversation"],
            },
            config: {
                idempotency: true,
                rateLimit: RateLimitPolicies.SENSITIVE,
            },
        },
        conversationController.sendMessage.bind(conversationController),
    );

    /**
     * Upload files to attach to a message.
     *
     * Separate from `POST /media` because the moderation channel is fixed at
     * upload time: a file uploaded here can only ever end up on a message.
     */
    fastify.post<{ Reply: { 200: UploadMessageMediaResponse } }>(
        "/messages/media",
        {
            onRequest: [fastify.authenticate],
            schema: {
                response: { 200: UploadMessageMediaResponseSchema },
                tags: ["Conversation"],
            },
            config: {
                idempotency: true,
                rateLimit: RateLimitPolicies.SENSITIVE,
            },
        },
        conversationController.uploadMedia.bind(conversationController),
    );

    fastify.delete<{ Params: MessageIdParams; Reply: { 204: void } }>(
        "/messages/:id",
        {
            onRequest: [fastify.authenticate],
            schema: {
                params: MessageIdParamsSchema,
                tags: ["Conversation"],
            },
            config: { rateLimit: RateLimitPolicies.SENSITIVE },
        },
        conversationController.deleteMessage.bind(conversationController),
    );
}
