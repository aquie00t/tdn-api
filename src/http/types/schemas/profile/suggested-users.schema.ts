import { Type as FBType, type Static } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { ResponseSchema } from "@typings/schemas/create-response-schema";

export const SuggestedUserItemSchema = FBType.Object({
    userId: FBType.String({ format: "uuid" }),
    username: FBType.String(),
    fullName: FBType.String(),
    avatarUrl: FBType.String(),
    isVerified: FBType.Boolean(),
    bannerUrl: FBType.String(),
    bio: FBType.Union([FBType.String(), FBType.Null()]),
    followersCount: FBType.Number(),
    isFollowing: FBType.Literal(false),
    isMe: FBType.Literal(false),
});

export type SuggestedUserItemResponse = Static<typeof SuggestedUserItemSchema>;

export const SuggestedUsersQuerySchema = Type.Object({
    limit: Type.Number({ default: 10, minimum: 1, maximum: 20 }),
});

export type SuggestedUsersQuery = Static<typeof SuggestedUsersQuerySchema>;

export const SuggestedUsersResponseSchema = ResponseSchema(
    FBType.Array(SuggestedUserItemSchema),
);

export type SuggestedUsersResponse = Static<
    typeof SuggestedUsersResponseSchema
>;
