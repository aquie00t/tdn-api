import { Type as FBType, type Static } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";

export const FollowListItemSchema = FBType.Object({
    userId: FBType.String({ format: "uuid" }),
    username: FBType.String(),
    fullName: FBType.String(),
    avatarUrl: FBType.String(),
    isVerified: FBType.Boolean(),
    bio: FBType.Union([FBType.String(), FBType.Null()]),
    isFollowing: FBType.Boolean(),
    isMe: FBType.Boolean(),
});

export type FollowListItem = Static<typeof FollowListItemSchema>;

export const FollowsListResponseSchema = FBType.Object({
    data: FBType.Array(FollowListItemSchema),
    meta: FBType.Object({
        limit: FBType.Number(),
        offset: FBType.Number(),
        count: FBType.Number(),
    }),
});
export type FollowsListResponse = Static<typeof FollowsListResponseSchema>;

export const FollowersParamsSchema = Type.Object({
    username: Type.String(),
});
export type FollowersParams = Static<typeof FollowersParamsSchema>;

export const PaginationQuerySchema = Type.Object({
    limit: Type.Number({ default: 20, minimum: 1, maximum: 50 }),
    offset: Type.Number({ default: 0, minimum: 0 }),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;
