import { Type as FBType, type Static } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { PostCategory } from "@core/domain/enums/post-category-enum";

export const BotProfilesQuerySchema = Type.Object({
    // Accepts a single value, a repeated key, or a comma separated list, in any
    // case. Membership is checked in the controller so that every shape gives
    // the same answer - constraining the enum here would 400 a repeated-key
    // request that the comma separated spelling accepts.
    categories: Type.Optional(
        Type.Union([Type.Array(Type.String()), Type.String()], {
            description: `Categories to match, at least one of: ${Object.values(
                PostCategory,
            ).join(", ")}. Unknown values are rejected with a 400.`,
        }),
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
    isVerified: FBType.Boolean(),
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
