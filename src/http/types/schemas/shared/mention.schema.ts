import { Type as FBType } from "@fastify/type-provider-typebox";

/**
 * A user named with an @handle in a post, comment or article body.
 *
 * The username is the account's current handle rather than the text written
 * in the body, so a rename is reflected without rewriting any content.
 */
export const MentionSchema = FBType.Object({
    id: FBType.String({ format: "uuid" }),
    username: FBType.String(),
});
