import { Type as FBType, type Static } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { PostCategory } from "@core/domain/enums/post-category-enum";

export const BotProfilesQuerySchema = Type.Object({
    categories: Type.Optional(
        Type.Union([
            Type.Array(Type.Enum(PostCategory)),
            Type.Enum(PostCategory),
            Type.String(),
        ]),
    ),
    limit: Type.Number({ default: 20, minimum: 1, maximum: 50 }),
    offset: Type.Number({ default: 0, minimum: 0 }),
});

export type BotProfilesQuery = Static<typeof BotProfilesQuerySchema>;

export const BotProfileItemSchema = FBType.Object({
    userId: FBType.String({ format: "uuid" }),
    username: FBType.String(),
    fullName: FBType.String(),
    avatarUrl: FBType.String(),
    bannerUrl: FBType.String(),
    bio: FBType.Union([FBType.String(), FBType.Null()]),
    categories: FBType.Array(FBType.Enum(PostCategory)),
    followersCount: FBType.Number(),
    isFollowing: FBType.Boolean(),
});

export type BotProfileItemResponse = Static<typeof BotProfileItemSchema>;

export const BotProfilesResponseSchema = FBType.Object({
    data: FBType.Array(BotProfileItemSchema),
    meta: FBType.Object({
        timestamp: FBType.String({ format: "date-time" }),
        limit: FBType.Number(),
        offset: FBType.Number(),
        count: FBType.Number(),
    }),
});

export type BotProfilesResponse = Static<typeof BotProfilesResponseSchema>;
