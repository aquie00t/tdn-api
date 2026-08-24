import { Type as FBType, type Static } from "@fastify/type-provider-typebox";
import { ResponseSchema } from "../create-response-schema";

export const ArticleAuthorSchema = FBType.Object({
    id: FBType.String({ format: "uuid" }),
    username: FBType.Optional(FBType.String()),
    fullName: FBType.Union([FBType.String(), FBType.Null()]),
    avatarUrl: FBType.String(),
    isMe: FBType.Boolean(),
});

/**
 * The canonical article shape returned by every article endpoint.
 *
 * `body` carries raw markdown exactly as the author wrote it. The API never
 * renders it, so clients must render it with a sanitizing renderer.
 */
export const ArticleItemSchema = FBType.Object({
    id: FBType.String({ format: "uuid" }),
    slug: FBType.String(),
    title: FBType.String(),
    body: FBType.String(),
    excerpt: FBType.Union([FBType.String(), FBType.Null()]),
    coverImageUrl: FBType.Union([FBType.String(), FBType.Null()]),
    coverImageAlt: FBType.Union([FBType.String(), FBType.Null()]),
    status: FBType.String(),
    publishedAt: FBType.Union([FBType.String(), FBType.Null()]),
    readingTimeMinutes: FBType.Number(),
    createdAt: FBType.String(),
    updatedAt: FBType.String(),
    likeCount: FBType.Number(),
    commentCount: FBType.Number(),
    isLiked: FBType.Boolean(),
    isBookmarked: FBType.Boolean(),
    author: ArticleAuthorSchema,
    tags: FBType.Array(FBType.Object({ name: FBType.String() })),
    categories: FBType.Array(FBType.Object({ name: FBType.String() })),
});

export type ArticleItem = Static<typeof ArticleItemSchema>;

/** Envelope shared by create, update, publish and archive. */
export const ArticleResponseSchema = ResponseSchema(ArticleItemSchema);
export type ArticleResponse = Static<typeof ArticleResponseSchema>;
