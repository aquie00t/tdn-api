import { Type, type Static } from "@fastify/type-provider-typebox";

/**
 * The slug pattern is deliberately narrow: it is the only shape the slug
 * generator can produce, so anything else can be rejected by the router before
 * it reaches a query.
 */
export const getArticleParamsSchema = Type.Object({
    slug: Type.String({
        pattern: "^[a-z0-9-]{1,120}$",
        description: "The URL slug of the article",
    }),
});

export type GetArticleParams = Static<typeof getArticleParamsSchema>;
