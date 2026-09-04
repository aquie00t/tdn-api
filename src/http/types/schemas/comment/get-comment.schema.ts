import { Type as FBType, type Static } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { ResponseSchema } from "../create-response-schema";
import { MentionSchema } from "../shared/mention.schema";

export const CommentAuthorSchema = FBType.Object({
    id: FBType.String({ format: "uuid" }),
    username: FBType.String(),
    fullName: FBType.Optional(FBType.String()),
    avatarUrl: FBType.String(),
    isMe: FBType.Boolean(),
});

export const CommentItemSchema = FBType.Object({
    id: FBType.String({ format: "uuid" }),
    content: FBType.String(),
    // Nullable in lockstep with CommentResponse. fast-json-stringify coerces a
    // value that does not match its schema instead of rejecting it, so leaving
    // this as a plain string would emit a wrong postId for an article comment
    // rather than failing.
    postId: FBType.Union([FBType.String({ format: "uuid" }), FBType.Null()]),
    articleId: FBType.Union([FBType.String({ format: "uuid" }), FBType.Null()]),
    parentId: FBType.Union([FBType.String({ format: "uuid" }), FBType.Null()]),
    mediaUrls: FBType.Array(FBType.String()),
    // True when moderation judged the media borderline: the client shows it
    // behind a blur rather than inline.
    isSensitive: FBType.Boolean(),
    // True while an attached video is stored but not yet cleared. mediaUrls is
    // empty in the meantime; the client can say so rather than showing a post
    // that looks like it lost its attachment.
    mediaPending: FBType.Boolean(),
    createdAt: FBType.String(),
    likeCount: FBType.Number(),
    replyCount: FBType.Number(),
    isLiked: FBType.Boolean(),
    isBookmarked: FBType.Boolean(),
    mentions: FBType.Array(MentionSchema),
    author: CommentAuthorSchema,
});

export type CommentItem = Static<typeof CommentItemSchema>;

export const GetCommentResponseSchema = ResponseSchema(CommentItemSchema);
export type GetCommentResponse = Static<typeof GetCommentResponseSchema>;

export const getCommentParamsSchema = Type.Object({
    commentId: Type.String({ format: "uuid", description: "Comment ID" }),
});

export type GetCommentParams = Static<typeof getCommentParamsSchema>;
