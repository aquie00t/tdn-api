import { Type as FBType, type Static } from "@fastify/type-provider-typebox";

/**
 * The query an unsubscribe link carries.
 *
 * `u` and `t` are short on purpose: the whole URL travels in an email header
 * as well as in the body, and some clients fold or truncate long ones.
 */
export const UnsubscribeQuerySchema = FBType.Object({
    u: FBType.String({ format: "uuid" }),
    t: FBType.String({ minLength: 64, maxLength: 64 }),
    action: FBType.Optional(
        FBType.Union([
            FBType.Literal("unsubscribe"),
            FBType.Literal("resubscribe"),
        ]),
    ),
});

export type UnsubscribeQuery = Static<typeof UnsubscribeQuerySchema>;
