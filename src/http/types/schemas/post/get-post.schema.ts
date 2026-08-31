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

/**
 * The quoted post embedded in a quote post.
 *
 * One level only: a quote card carries no `quotedPost` of its own, and no
 * counters or viewer-specific flags.
 */
export const QuotedPostSchema = FBType.Object({
    id: FBType.String({ format: "uuid" }),
    content: FBType.String(),
    mediaUrls: FBType.Array(FBType.String()),
    createdAt: FBType.String(),
    author: PostAuthorSchema,
});

export type QuotedPost = Static<typeof QuotedPostSchema>;

export const PostItemSchema = FBType.Object({
    id: FBType.String({ format: "uuid" }),
    content: FBType.String(),
    type: FBType.Enum(PostType),
    mediaUrls: FBType.Array(FBType.String()),
    createdAt: FBType.String(),
    likeCount: FBType.Number(),
    commentCount: FBType.Number(),
    quoteCount: FBType.Number(),
    isLiked: FBType.Boolean(),
    isBookmarked: FBType.Boolean(),
    // Null whenever the detector could not call it, which the client needs in
    // order to decide whether offering a translation makes any sense.
    lang: FBType.Union([FBType.String(), FBType.Null()]),
    author: PostAuthorSchema,
    tags: FBType.Array(FBType.Object({ name: FBType.String() })),
    categories: FBType.Array(FBType.Object({ name: FBType.String() })),
    quotedPost: FBType.Union([QuotedPostSchema, FBType.Null()]),
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
