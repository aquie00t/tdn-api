import { Type as FBType, type Static } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { PostCategory } from "@core/domain/enums/post-category-enum";

export const ProfileItemSchema = FBType.Object({
    id: FBType.String({ format: "uuid" }),
    username: FBType.String(),
    fullName: FBType.String(),
    bio: FBType.Union([FBType.String(), FBType.Null()]),
    location: FBType.Union([FBType.String(), FBType.Null()]),
    avatarUrl: FBType.String(),
    bannerUrl: FBType.String(),
    socials: FBType.Record(FBType.String(), FBType.String()),
    categories: FBType.Array(FBType.Enum(PostCategory)),
    languages: FBType.Array(FBType.String()),
    createdAt: FBType.String(),
    updatedAt: FBType.String(),
    followersCount: FBType.Number(),
    followingCount: FBType.Number(),
    postCount: FBType.Number(),
    articleCount: FBType.Number(),
    isMe: FBType.Boolean(),
    isFollowing: FBType.Boolean(),
});

export type ProfileItem = Static<typeof ProfileItemSchema>;

export const GetProfileResponseSchema = FBType.Object({
    data: ProfileItemSchema,
    meta: FBType.Object({ timestamp: FBType.String({ format: "date-time" }) }),
});
export type GetProfileResponse = Static<typeof GetProfileResponseSchema>;

export const GetProfileParamsSchema = Type.Object({
    username: Type.String({
        minLength: 3,
        maxLength: 30,
        pattern: "^[a-zA-Z0-9._]+$",
    }),
});

export type GetProfileParams = Static<typeof GetProfileParamsSchema>;
