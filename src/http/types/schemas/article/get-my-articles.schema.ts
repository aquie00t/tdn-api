import { Type, type Static } from "@fastify/type-provider-typebox";
import { ArticleStatus } from "@core/domain/enums/article-status.enum";

export const getMyArticlesQuerySchema = Type.Object({
    page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 10 })),
    status: Type.Optional(Type.Enum(ArticleStatus)),
});

export type GetMyArticlesQuery = Static<typeof getMyArticlesQuerySchema>;
