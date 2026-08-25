import { Type, type Static } from "@fastify/type-provider-typebox";
import { CommentItemSchema } from "../comment/get-comment.schema";
import { ResponseSchema } from "../create-response-schema";

export const articleCommentParamsSchema = Type.Object({
    articleId: Type.String({
        format: "uuid",
        description: "The unique identifier of the article",
    }),
});

export type ArticleCommentParams = Static<typeof articleCommentParamsSchema>;

export const createArticleCommentBodySchema = Type.Object({
    content: Type.String({ minLength: 1, maxLength: 1000 }),
    parentId: Type.Optional(Type.String({ format: "uuid" })),
    mediaUrls: Type.Optional(
        Type.Array(Type.String({ format: "uri" }), { maxItems: 4 }),
    ),
});

export type CreateArticleCommentBody = Static<
    typeof createArticleCommentBodySchema
>;

export const CreateArticleCommentResponseSchema =
    ResponseSchema(CommentItemSchema);

export type CreateArticleCommentResponse = Static<
    typeof CreateArticleCommentResponseSchema
>;

export const getArticleCommentsQuerySchema = Type.Object({
    page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 10 })),
});

export type GetArticleCommentsQuery = Static<
    typeof getArticleCommentsQuerySchema
>;

export const GetArticleCommentsResponseSchema = Type.Object({
    data: Type.Array(CommentItemSchema),
    meta: Type.Object({
        currentPage: Type.Number(),
        limit: Type.Number(),
    }),
});

export type GetArticleCommentsResponse = Static<
    typeof GetArticleCommentsResponseSchema
>;
