import { Type as FBType, type Static } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";

export const BlockUserBodySchema = Type.Object({
    targetId: Type.String({ format: "uuid" }),
});

export type BlockUserBody = Static<typeof BlockUserBodySchema>;

export const BlockActionResponseSchema = Type.Object({
    data: Type.Object({
        isBlocked: Type.Boolean(),
    }),
    meta: Type.Object({ timestamp: Type.String({ format: "date-time" }) }),
});
export type BlockActionResponse = Static<typeof BlockActionResponseSchema>;

export const BlockedUserItemSchema = FBType.Object({
    userId: FBType.String({ format: "uuid" }),
    username: FBType.String(),
    fullName: FBType.String(),
    avatarUrl: FBType.String(),
    bio: FBType.Union([FBType.String(), FBType.Null()]),
});

export type BlockedUserItem = Static<typeof BlockedUserItemSchema>;

export const BlockedUsersResponseSchema = FBType.Object({
    data: FBType.Array(BlockedUserItemSchema),
    meta: FBType.Object({
        limit: FBType.Number(),
        offset: FBType.Number(),
        count: FBType.Number(),
        total: FBType.Number(),
    }),
});
export type BlockedUsersResponse = Static<typeof BlockedUsersResponseSchema>;

export const BlockedListQuerySchema = Type.Object({
    limit: Type.Number({ default: 20, minimum: 1, maximum: 50 }),
    offset: Type.Number({ default: 0, minimum: 0 }),
});

export type BlockedListQuery = Static<typeof BlockedListQuerySchema>;
