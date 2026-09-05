import { type Static, Type } from "@fastify/type-provider-typebox";

/**
 * Which kind of client is asking for a session.
 *
 * A browser keeps its refresh token in an httpOnly cookie it cannot read; a
 * native app has no such cookie to rely on - persistence across app restarts
 * is not dependable in React Native - and keeps the token in the platform
 * keystore instead. The two therefore need the token delivered on different
 * channels, and this is how the caller says which.
 *
 * Absent means `web`, so every existing client keeps the behaviour it has.
 */
export const ClientKindSchema = Type.Optional(
    Type.Union([Type.Literal("web"), Type.Literal("native")]),
);

export type ClientKind = Static<typeof ClientKindSchema>;

/**
 * The refresh token, as returned to a native client.
 *
 * Optional on every response that carries it: a browser is answered through
 * the cookie and these fields are simply absent. They are never populated for
 * a request that arrived on the cookie channel, which is what keeps a refresh
 * token out of reach of page JavaScript.
 */
export const NativeSessionFields = {
    refreshToken: Type.Optional(Type.String()),
    refreshTokenExpiresAt: Type.Optional(Type.Number()),
};
