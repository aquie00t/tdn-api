import { Type } from "@sinclair/typebox";
import { type Static } from "@fastify/type-provider-typebox";
import { PostType } from "@core/domain/enums/post-type.enum";
import { ResponseSchema } from "../create-response-schema";
import { PostItemSchema } from "./get-post.schema";
import { PostCategory } from "@core/domain/enums/post-category-enum";

export const createPostBodySchema = Type.Object({
    content: Type.String({
        // Empty is allowed only alongside quotedPostId, which is a pure
        // repost. The use case rejects an empty post that quotes nothing -
        // the rule spans two fields, so it does not belong in the schema.
        minLength: 0,
        maxLength: 300,
        description:
            "The post body. May be empty only when quotedPostId is set.",
    }),
    type: Type.Enum(PostType, {
        default: PostType.COMMUNITY,
    }),
    mediaUrls: Type.Optional(
        Type.Array(
            Type.String({
                format: "uri",
            }),
            {
                maxItems: 4,
            },
        ),
    ),
    categories: Type.Optional(
        Type.Array(Type.Enum(PostCategory), {
            maxItems: 5,
            uniqueItems: true,
        }),
    ),
    quotedPostId: Type.Optional(
        Type.String({
            format: "uuid",
            description: "The post this one quotes, rendered as a quote card",
        }),
    ),
});

export type CreatePostBody = Static<typeof createPostBodySchema>;

export const CreatePostResponseSchema = ResponseSchema(PostItemSchema);
export type CreatePostResponse = Static<typeof CreatePostResponseSchema>;
