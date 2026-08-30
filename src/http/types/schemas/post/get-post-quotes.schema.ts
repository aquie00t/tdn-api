import { Type } from "@sinclair/typebox";
import { Type as FBType, type Static } from "@fastify/type-provider-typebox";
import { PostItemSchema } from "./get-post.schema";

export const getPostQuotesParamsSchema = Type.Object({
    id: Type.String({
        format: "uuid",
        description: "The post whose quotes are being listed",
    }),
});

export const getPostQuotesQuerySchema = Type.Object({
    page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, default: 10 })),
});

export type GetPostQuotesParams = Static<typeof getPostQuotesParamsSchema>;
export type GetPostQuotesQuery = Static<typeof getPostQuotesQuerySchema>;

export const GetPostQuotesResponseSchema = FBType.Object({
    data: FBType.Array(PostItemSchema),
    meta: FBType.Object({
        total: FBType.Number(),
        currentPage: FBType.Number(),
        limit: FBType.Number(),
        totalPages: FBType.Number(),
    }),
});
export type GetPostQuotesResponse = Static<typeof GetPostQuotesResponseSchema>;
