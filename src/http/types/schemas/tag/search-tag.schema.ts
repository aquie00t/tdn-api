import { Type, type Static } from "@sinclair/typebox";

export const SearchTagsQuerySchema = Type.Object({
    q: Type.String({
        minLength: 1,
        maxLength: 50,
        description: "Search term for tag name",
    }),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 10 })),
});

export type SearchTagsQuery = Static<typeof SearchTagsQuerySchema>;

export const SearchTagsResponseSchema = Type.Object({
    data: Type.Array(
        Type.Object({
            name: Type.String(),
            postCount: Type.Number(),
            articleCount: Type.Number(),
            category: Type.Union([Type.String(), Type.Null()]),
        }),
    ),
    meta: Type.Object({
        timestamp: Type.String(),
        count: Type.Number(),
    }),
});
