import { Type, type Static } from "@fastify/type-provider-typebox";
import { PostCategory } from "@core/domain/enums/post-category-enum";
import { ArticleItemSchema } from "./article-item.schema";

export const getArticlesQuerySchema = Type.Object({
    page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 10 })),
    tag: Type.Optional(Type.String({ maxLength: 30 })),
    authorUsername: Type.Optional(Type.String({ maxLength: 30 })),
    categories: Type.Optional(
        Type.Array(Type.Enum(PostCategory), { maxItems: 5, uniqueItems: true }),
    ),
    followedOnly: Type.Optional(Type.Boolean({ default: false })),
});

export type GetArticlesQuery = Static<typeof getArticlesQuerySchema>;

/** Paginated envelope, hand-rolled because it carries counts rather than a timestamp. */
export const GetArticlesResponseSchema = Type.Object({
    data: Type.Array(ArticleItemSchema),
    meta: Type.Object({
        total: Type.Number(),
        currentPage: Type.Number(),
        limit: Type.Number(),
        totalPages: Type.Number(),
    }),
});

export type GetArticlesResponse = Static<typeof GetArticlesResponseSchema>;
