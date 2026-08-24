import { Type, type Static } from "@fastify/type-provider-typebox";
import { PostCategory } from "@core/domain/enums/post-category-enum";
import { MAX_ARTICLE_BODY_LENGTH } from "./create-article.schema";

/**
 * Every field is optional; an omitted field is left untouched.
 *
 * Nullable fields distinguish "leave alone" (omitted) from "clear" (null),
 * which is why they are unions rather than plain optionals.
 */
export const updateArticleBodySchema = Type.Object({
    title: Type.Optional(Type.String({ minLength: 1, maxLength: 160 })),
    body: Type.Optional(
        Type.String({ minLength: 1, maxLength: MAX_ARTICLE_BODY_LENGTH }),
    ),
    excerpt: Type.Optional(
        Type.Union([Type.String({ maxLength: 300 }), Type.Null()]),
    ),
    coverImageKey: Type.Optional(
        Type.Union([Type.String({ maxLength: 200 }), Type.Null()]),
    ),
    coverImageAlt: Type.Optional(
        Type.Union([Type.String({ maxLength: 160 }), Type.Null()]),
    ),
    tags: Type.Optional(
        Type.Array(Type.String({ maxLength: 30 }), {
            maxItems: 5,
            uniqueItems: true,
        }),
    ),
    categories: Type.Optional(
        Type.Array(Type.Enum(PostCategory), { maxItems: 5, uniqueItems: true }),
    ),
});

export type UpdateArticleBody = Static<typeof updateArticleBodySchema>;
