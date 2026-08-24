import { Type, type Static } from "@fastify/type-provider-typebox";
import { PostCategory } from "@core/domain/enums/post-category-enum";

/** Upper bound on the markdown body, in characters. */
export const MAX_ARTICLE_BODY_LENGTH = 100_000;

/** Upper bound on the raw request body, in bytes. */
export const ARTICLE_BODY_LIMIT_BYTES = 256 * 1024;

export const createArticleBodySchema = Type.Object({
    title: Type.String({ minLength: 1, maxLength: 160 }),
    body: Type.String({ minLength: 1, maxLength: MAX_ARTICLE_BODY_LENGTH }),
    excerpt: Type.Optional(Type.String({ maxLength: 300 })),
    coverImageKey: Type.Optional(Type.String({ maxLength: 200 })),
    coverImageAlt: Type.Optional(Type.String({ maxLength: 160 })),
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

export type CreateArticleBody = Static<typeof createArticleBodySchema>;
