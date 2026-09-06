import { Type } from "@sinclair/typebox";
import { Type as FBType, type Static } from "@fastify/type-provider-typebox";
import { PostCategory } from "@core/domain/enums/post-category-enum";

export const SearchProfilesQuerySchema = Type.Object({
    q: Type.String({
        minLength: 2,
        maxLength: 50,
        description: "Search term for username or full name",
    }),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 10 })),
});

export type SearchProfilesQuery = Static<typeof SearchProfilesQuerySchema>;

export const SearchProfileItemSchema = FBType.Object({
    id: FBType.String({ format: "uuid" }),
    username: FBType.String(),
    fullName: FBType.String(),
    bio: FBType.Union([FBType.String(), FBType.Null()]),
    location: FBType.Union([FBType.String(), FBType.Null()]),
    avatarUrl: FBType.String(),
    isVerified: FBType.Boolean(),
    bannerUrl: FBType.String(),
    socials: FBType.Record(FBType.String(), FBType.String()),
    categories: FBType.Array(FBType.Enum(PostCategory)),
    createdAt: FBType.String(),
    updatedAt: FBType.String(),
    followersCount: FBType.Number(),
    followingCount: FBType.Number(),
    isMe: FBType.Boolean(),
    isFollowing: FBType.Boolean(),
});

export const SearchProfilesResponseSchema = FBType.Object({
    data: FBType.Array(SearchProfileItemSchema),
    meta: FBType.Object({
        timestamp: FBType.String({ format: "date-time" }),
        count: FBType.Number(),
    }),
});
export type SearchProfilesResponse = Static<
    typeof SearchProfilesResponseSchema
>;
