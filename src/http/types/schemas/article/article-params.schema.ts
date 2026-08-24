import { Type, type Static } from "@fastify/type-provider-typebox";

/**
 * Path parameters for every article mutation.
 *
 * Mutations key on the identifier while the public read keys on the slug: the
 * identifier is stable internal identity, the slug is a shareable URL.
 */
export const articleIdParamsSchema = Type.Object({
    id: Type.String({
        format: "uuid",
        description: "The unique identifier of the article",
    }),
});

export type ArticleIdParams = Static<typeof articleIdParamsSchema>;
