import { Type } from "@sinclair/typebox";
import { Type as FBType, type Static } from "@fastify/type-provider-typebox";
import { ConversationItemSchema } from "./conversation.schema";
import { ResponseSchema } from "../create-response-schema";

/** Longest message text accepted, in characters. */
export const MAX_MESSAGE_LENGTH = 4000;

/** Most files one message may carry. */
export const MAX_MESSAGE_MEDIA = 4;

export const MessageItemSchema = FBType.Object({
    id: FBType.String({ format: "uuid" }),
    conversationId: FBType.String({ format: "uuid" }),
    senderId: FBType.String({ format: "uuid" }),
    content: FBType.String(),
    mediaUrls: FBType.Array(FBType.String()),
    isSensitive: FBType.Boolean(),
    mediaPending: FBType.Boolean(),
    mediaRejected: FBType.Boolean(),
    isDeleted: FBType.Boolean(),
    isMine: FBType.Boolean(),
    createdAt: FBType.String({ format: "date-time" }),
});

export const GetMessagesQuerySchema = Type.Object({
    limit: Type.Optional(
        Type.Number({ minimum: 1, maximum: 100, default: 30 }),
    ),
    cursor: Type.Optional(
        Type.String({
            description:
                "Opaque cursor from a previous response's `meta.nextCursor`. Pages backwards through the thread, newest first.",
        }),
    ),
});
export type GetMessagesQuery = Static<typeof GetMessagesQuerySchema>;

export const GetMessagesResponseSchema = FBType.Object({
    data: FBType.Object({
        // The thread header travels with the first page so opening a
        // conversation is one request rather than two.
        conversation: ConversationItemSchema,
        messages: FBType.Array(MessageItemSchema),
    }),
    meta: FBType.Object({
        timestamp: FBType.String({ format: "date-time" }),
        nextCursor: FBType.Union([FBType.String(), FBType.Null()]),
    }),
});
export type GetMessagesResponse = Static<typeof GetMessagesResponseSchema>;

export const SendMessageBodySchema = Type.Object(
    {
        content: Type.Optional(
            Type.String({
                maxLength: MAX_MESSAGE_LENGTH,
                description:
                    "The message text. May be omitted when media is attached, but a message with neither is refused.",
            }),
        ),
        mediaUrls: Type.Optional(
            Type.Array(Type.String(), {
                maxItems: MAX_MESSAGE_MEDIA,
                description:
                    "URLs returned by `POST /messages/media`. Each one must be a file this sender uploaded through that endpoint.",
            }),
        ),
    },
    {
        description:
            "At least one of `content` and `mediaUrls` must carry something.",
    },
);
export type SendMessageBody = Static<typeof SendMessageBodySchema>;

export const MessageResponseSchema = ResponseSchema(MessageItemSchema);
export type MessageResponseBody = Static<typeof MessageResponseSchema>;

export const MessageIdParamsSchema = Type.Object({
    id: Type.String({ format: "uuid", description: "Message ID" }),
});
export type MessageIdParams = Static<typeof MessageIdParamsSchema>;

export const UploadMessageMediaResponseSchema = ResponseSchema(
    FBType.Object({ mediaUrls: FBType.Array(FBType.String()) }),
);
export type UploadMessageMediaResponse = Static<
    typeof UploadMessageMediaResponseSchema
>;
