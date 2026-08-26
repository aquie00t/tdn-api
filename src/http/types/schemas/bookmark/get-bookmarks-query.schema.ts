/**
 * Schema for bookmark retrieval query parameters
 */
import { Type } from "@sinclair/typebox";
import { Type as FBType, type Static } from "@fastify/type-provider-typebox";
import { PostItemSchema } from "../post/get-post.schema";
import { CommentItemSchema } from "../comment/get-comment.schema";
import { ArticleSummarySchema } from "../article/article-item.schema";

/**
 * Schema for retrieving bookmarks
 * @description Validates pagination parameters for bookmark listing
 */
export const getBookmarksQuerySchema = Type.Object({
    /** Page number for pagination (minimum: 1, default: 1) */
    page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
    /** Number of bookmarks per page (minimum: 1, maximum: 100, default: 10) */
    limit: Type.Optional(
        Type.Number({ minimum: 1, maximum: 100, default: 10 }),
    ),
});

/**
 * Type for bookmark retrieval query parameters
 */
export type GetBookmarksQuery = Static<typeof getBookmarksQuerySchema>;

/**
 * Articles are summaries rather than full items: a saved list renders cards,
 * and an article body can be 100 KB of markdown.
 */
export const GetBookmarksResponseSchema = FBType.Object({
    data: FBType.Object({
        posts: FBType.Array(PostItemSchema),
        comments: FBType.Array(CommentItemSchema),
        articles: FBType.Array(ArticleSummarySchema),
    }),
    meta: FBType.Object({
        postTotal: FBType.Number(),
        commentTotal: FBType.Number(),
        articleTotal: FBType.Number(),
        page: FBType.Number(),
        timestamp: FBType.String({ format: "date-time" }),
    }),
});
export type GetBookmarksResponse = Static<typeof GetBookmarksResponseSchema>;
