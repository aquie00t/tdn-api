import { Type as FBType, type Static } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { PostType } from "@core/domain/enums/post-type.enum";

export const PostAuthorSchema = FBType.Object({
    id: FBType.String({ format: "uuid" }),
    username: FBType.String(),
    avatarUrl: FBType.String(),
    fullName: FBType.Union([FBType.String(), FBType.Null()]),
    isMe: FBType.Optional(FBType.Boolean()),
});

export const PostItemSchema = FBType.Object({
    id: FBType.String({ format: "uuid" }),
    content: FBType.String(),
    type: FBType.Enum(PostType),
    mediaUrls: FBType.Array(FBType.String()),
    createdAt: FBType.String(),
    likeCount: FBType.Number(),
    commentCount: FBType.Number(),
    isLiked: FBType.Boolean(),
    isBookmarked: FBType.Boolean(),
    author: PostAuthorSchema,
    tags: FBType.Array(FBType.Object({ name: FBType.String() })),
    categories: FBType.Array(FBType.Object({ name: FBType.String() })),
});

export type PostItem = Static<typeof PostItemSchema>;

export const GetPostResponseSchema = FBType.Object({
    data: PostItemSchema,
});
export type GetPostResponse = Static<typeof GetPostResponseSchema>;

export const getPostParamsSchema = Type.Object({
    id: Type.String({
        format: "uuid",
        description: "The unique identifier of the post",
    }),
});

export type GetPostParams = Static<typeof getPostParamsSchema>;
