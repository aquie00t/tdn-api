import { Type, type Static } from "@sinclair/typebox";
import {
    Type as FBType,
    type Static as FBStatic,
} from "@fastify/type-provider-typebox";
import { PostType } from "@core/domain/enums/post-type.enum";
import { PostCategory } from "@core/domain/enums/post-category-enum";
import { PostItemSchema } from "./get-post.schema";

export const getPostsQuerySchema = Type.Object({
    page: Type.Optional(
        Type.Number({
            default: 1,
            minimum: 1,
            deprecated: true,
            description:
                "Deprecated: use `cursor`. Page numbers are computed against whatever ranked order exists at request time, so a feed being written to shifts underneath them.",
        }),
    ),
    cursor: Type.Optional(
        Type.String({
            maxLength: 512,
            description:
                "Opaque cursor from a previous response's `meta.nextCursor`. Takes precedence over `page`. A cursor that has expired is not an error - the feed rebuilds and serves the same depth.",
        }),
    ),
    limit: Type.Optional(
        Type.Number({
            default: 10,
            minimum: 1,
            maximum: 50,
        }),
    ),
    type: Type.Optional(Type.Enum(PostType, {})),
    tag: Type.Optional(Type.String({ minLength: 1, maxLength: 50 })),
    followedOnly: Type.Optional(Type.Boolean()),
    categories: Type.Optional(
        Type.Union([
            Type.Array(Type.Enum(PostCategory)),
            Type.Enum(PostCategory),
            Type.String(),
        ]),
    ),
});

export type GetPostsQuery = Static<typeof getPostsQuerySchema>;

export const GetFeedResponseSchema = FBType.Object({
    data: FBType.Array(PostItemSchema),
    meta: FBType.Object({
        total: FBType.Number(),
        currentPage: FBType.Number(),
        limit: FBType.Number(),
        totalPages: FBType.Number(),
        // Null once the feed is exhausted, and on the chronological feeds that
        // have no ranked order to pin a reader to.
        nextCursor: FBType.Union([FBType.String(), FBType.Null()]),
        hasMore: FBType.Boolean(),
    }),
});
export type GetFeedResponse = FBStatic<typeof GetFeedResponseSchema>;
