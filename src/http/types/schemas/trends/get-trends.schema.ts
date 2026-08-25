import { Type, type Static } from "@sinclair/typebox";

export const getTrendsQuerySchema = Type.Object({
    limit: Type.Optional(
        Type.Number({
            default: 10,
            minimum: 1,
            maximum: 50,
        }),
    ),
});

export type GetTrendsQuery = Static<typeof getTrendsQuerySchema>;

export const GetTrendsResponseSchema = Type.Object({
    data: Type.Object({
        trends: Type.Array(
            Type.Object({
                tag: Type.String(),
                postCount: Type.Number(),
                articleCount: Type.Number(),
                category: Type.Union([Type.String(), Type.Null()]),
            }),
        ),
    }),
    meta: Type.Object({
        timestamp: Type.String(),
        windowDays: Type.Number(),
    }),
});
