import { Type } from "@sinclair/typebox";
import { Type as FBType, type Static } from "@fastify/type-provider-typebox";
import { ConversationStatus } from "@core/domain/enums";
import { ResponseSchema } from "../create-response-schema";

/**
 * One conversation as the inbox renders it.
 *
 * Everything is stated from the reader's side - who the other person is, how
 * many messages they have not seen, whether they may write - so a client never
 * has to know that the row stores its participants in sorted order.
 */
export const ConversationItemSchema = FBType.Object({
    id: FBType.String({ format: "uuid" }),
    status: FBType.Enum(ConversationStatus),
    isRequest: FBType.Boolean(),
    canSend: FBType.Boolean(),
    participant: FBType.Object({
        id: FBType.String({ format: "uuid" }),
        username: FBType.String(),
        fullName: FBType.Optional(FBType.String()),
        avatarUrl: FBType.String(),
        isVerified: FBType.Boolean(),
    }),
    unreadCount: FBType.Number(),
    lastMessagePreview: FBType.Union([FBType.String(), FBType.Null()]),
    lastMessageAt: FBType.Union([
        FBType.String({ format: "date-time" }),
        FBType.Null(),
    ]),
    otherLastReadAt: FBType.Union([
        FBType.String({ format: "date-time" }),
        FBType.Null(),
    ]),
    createdAt: FBType.String({ format: "date-time" }),
});

/**
 * Pagination metadata for a cursor-paged list.
 *
 * No total: the inbox reorders itself every time somebody writes, so a count
 * would be a number the next request already disagrees with, bought with an
 * extra query.
 */
const CursorMetaSchema = FBType.Object({
    timestamp: FBType.String({ format: "date-time" }),
    nextCursor: FBType.Union([FBType.String(), FBType.Null()]),
});

export const GetConversationsQuerySchema = Type.Object({
    status: Type.Optional(
        Type.Union(
            [
                Type.Literal(ConversationStatus.ACCEPTED),
                Type.Literal(ConversationStatus.PENDING),
            ],
            {
                default: ConversationStatus.ACCEPTED,
                description:
                    "ACCEPTED for the conversation list, PENDING for the requests tab. A declined conversation is never listed.",
            },
        ),
    ),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 20 })),
    cursor: Type.Optional(
        Type.String({
            description:
                "Opaque cursor from a previous response's `meta.nextCursor`.",
        }),
    ),
});
export type GetConversationsQuery = Static<typeof GetConversationsQuerySchema>;

export const GetConversationsResponseSchema = FBType.Object({
    data: FBType.Array(ConversationItemSchema),
    meta: CursorMetaSchema,
});
export type GetConversationsResponse = Static<
    typeof GetConversationsResponseSchema
>;

export const StartConversationBodySchema = Type.Object({
    recipientId: Type.String({
        format: "uuid",
        description: "The user to open a conversation with.",
    }),
});
export type StartConversationBody = Static<typeof StartConversationBodySchema>;

export const ConversationResponseSchema = ResponseSchema(
    ConversationItemSchema,
);
export type ConversationResponseBody = Static<
    typeof ConversationResponseSchema
>;

export const ConversationIdParamsSchema = Type.Object({
    id: Type.String({ format: "uuid", description: "Conversation ID" }),
});
export type ConversationIdParams = Static<typeof ConversationIdParamsSchema>;

export const UnreadMessageCountResponseSchema = ResponseSchema(
    FBType.Object({ count: FBType.Number() }),
);
export type UnreadMessageCountResponse = Static<
    typeof UnreadMessageCountResponseSchema
>;
