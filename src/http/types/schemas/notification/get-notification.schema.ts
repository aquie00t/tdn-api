import { Type } from "@sinclair/typebox";
import { Type as FBType, type Static } from "@fastify/type-provider-typebox";
import { MetaOnlyResponseSchema } from "../create-response-schema";
import { NotificationType } from "@core/domain/enums/notification-type.enum";

const NotificationItemSchema = FBType.Object({
    id: FBType.String({ format: "uuid" }),
    recipientId: FBType.String({ format: "uuid" }),
    issuerId: FBType.String({ format: "uuid" }),
    username: FBType.Optional(FBType.String()),
    type: FBType.Enum(NotificationType),
    avatarUrl: FBType.Optional(FBType.String()),
    // The most specific target id, kept for clients written against the old
    // shape. New clients should read the explicit ids below.
    referenceId: FBType.Optional(FBType.String()),
    // Where tapping the notification leads. A comment notification carries the
    // comment plus the post or article it lives under; a follow carries none of
    // them and leads to the issuer's profile via `username`.
    postId: FBType.Optional(FBType.String({ format: "uuid" })),
    articleId: FBType.Optional(FBType.String({ format: "uuid" })),
    articleSlug: FBType.Optional(FBType.String()),
    commentId: FBType.Optional(FBType.String({ format: "uuid" })),
    createdAt: FBType.String(),
    isRead: FBType.Boolean(),
});

export const GetNotificationsQuerySchema = Type.Object({
    page: Type.Optional(
        Type.Number({
            minimum: 1,
            default: 1,
        }),
    ),
    limit: Type.Optional(
        Type.Number({
            minimum: 1,
            maximum: 50,
            default: 10,
        }),
    ),
});

export type GetNotificationsQuery = Static<typeof GetNotificationsQuerySchema>;

export const GetNotificationsResponseSchema = FBType.Object({
    data: FBType.Array(NotificationItemSchema),
    meta: FBType.Object({
        total: FBType.Number(),
        currentPage: FBType.Number(),
        totalPages: FBType.Number(),
        limit: FBType.Number(),
    }),
});
export type GetNotificationsResponse = Static<
    typeof GetNotificationsResponseSchema
>;

export const MarkAllReadResponseSchema = MetaOnlyResponseSchema;
export type MarkAllReadResponse = Static<typeof MarkAllReadResponseSchema>;

export const NotificationIdParamsSchema = Type.Object({
    id: Type.String({ format: "uuid", description: "Notification ID" }),
});
export type NotificationIdParams = Static<typeof NotificationIdParamsSchema>;

export const UnreadCountResponseSchema = FBType.Object({
    data: FBType.Object({
        count: FBType.Number(),
    }),
    meta: FBType.Object({
        timestamp: FBType.String(),
    }),
});
export type UnreadCountResponse = Static<typeof UnreadCountResponseSchema>;
