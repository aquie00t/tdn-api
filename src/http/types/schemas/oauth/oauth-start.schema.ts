import { type Static, Type } from "@fastify/type-provider-typebox";

/**
 * Where the caller wants to be returned to when the flow finishes.
 *
 * Matched exactly against the configured allow-list; anything else is refused
 * rather than redirected somewhere safe. The value is not a hint - the target
 * receives the exchange code, and with it a session.
 *
 * Absent means the web app's own OAuth page, which is what every caller wanted
 * before there was anything else to want.
 */
export const OAuthStartQuerySchema = Type.Object({
    redirect: Type.Optional(Type.String({ maxLength: 500 })),
});

export type OAuthStartQuery = Static<typeof OAuthStartQuerySchema>;
