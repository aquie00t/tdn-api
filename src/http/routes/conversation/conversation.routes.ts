/**
 * Conversation routes module
 *
 * This module defines API endpoints for direct messaging including:
 * - Listing the inbox and the message-request tab
 * - Opening a conversation with another user
 * - Reading the unread badge
 * - Accepting or declining a request
 * - Marking a thread read
 *
 * @author TDN Team
 * @version 1.0.0
 */

import { RateLimitPolicies } from "@plugins/rate-limit.plugin";
import {
    ConversationIdParamsSchema,
    type ConversationIdParams,
    ConversationResponseSchema,
    type ConversationResponseBody,
    GetConversationsQuerySchema,
    type GetConversationsQuery,
    GetConversationsResponseSchema,
    type GetConversationsResponse,
    StartConversationBodySchema,
    type StartConversationBody,
    UnreadMessageCountResponseSchema,
    type UnreadMessageCountResponse,
} from "@typings/schemas/conversation/conversation.schema";
import type { FastifyInstance } from "fastify";

/**
 * Sets up conversation routes on the Fastify instance
 *
 * @param fastify - The Fastify application instance
 * @returns void
 */
export function conversationRoutes(fastify: FastifyInstance): void {
    const conversationController =
        fastify.diContainer.cradle.conversationController;

    fastify.get<{
        Querystring: GetConversationsQuery;
        Reply: { 200: GetConversationsResponse };
    }>(
        "/conversations",
        {
            onRequest: [fastify.authenticate],
            schema: {
                querystring: GetConversationsQuerySchema,
                response: { 200: GetConversationsResponseSchema },
                tags: ["Conversation"],
            },
            config: { rateLimit: RateLimitPolicies.STANDARD },
        },
        conversationController.getConversations.bind(conversationController),
    );

    fastify.post<{
        Body: StartConversationBody;
        Reply: { 201: ConversationResponseBody };
    }>(
        "/conversations",
        {
            onRequest: [fastify.authenticate],
            schema: {
                body: StartConversationBodySchema,
                response: { 201: ConversationResponseSchema },
                tags: ["Conversation"],
            },
            config: { rateLimit: RateLimitPolicies.SENSITIVE },
        },
        conversationController.startConversation.bind(conversationController),
    );

    // Declared before "/conversations/:id/..." only for readability: the
    // static "unread-count" segment outscores the ":id" parameter either way.
    fastify.get<{ Reply: { 200: UnreadMessageCountResponse } }>(
        "/conversations/unread-count",
        {
            onRequest: [fastify.authenticate],
            schema: {
                response: { 200: UnreadMessageCountResponseSchema },
                tags: ["Conversation"],
            },
            config: { rateLimit: RateLimitPolicies.STANDARD },
        },
        conversationController.getUnreadCount.bind(conversationController),
    );

    fastify.patch<{ Params: ConversationIdParams; Reply: { 204: void } }>(
        "/conversations/:id/read",
        {
            onRequest: [fastify.authenticate],
            schema: {
                params: ConversationIdParamsSchema,
                tags: ["Conversation"],
            },
            config: { rateLimit: RateLimitPolicies.STANDARD },
        },
        conversationController.markAsRead.bind(conversationController),
    );

    fastify.patch<{
        Params: ConversationIdParams;
        Reply: { 200: ConversationResponseBody };
    }>(
        "/conversations/:id/accept",
        {
            onRequest: [fastify.authenticate],
            schema: {
                params: ConversationIdParamsSchema,
                response: { 200: ConversationResponseSchema },
                tags: ["Conversation"],
            },
            config: { rateLimit: RateLimitPolicies.SENSITIVE },
        },
        conversationController.acceptRequest.bind(conversationController),
    );

    fastify.patch<{
        Params: ConversationIdParams;
        Reply: { 200: ConversationResponseBody };
    }>(
        "/conversations/:id/decline",
        {
            onRequest: [fastify.authenticate],
            schema: {
                params: ConversationIdParamsSchema,
                response: { 200: ConversationResponseSchema },
                tags: ["Conversation"],
            },
            config: { rateLimit: RateLimitPolicies.SENSITIVE },
        },
        conversationController.declineRequest.bind(conversationController),
    );
}
