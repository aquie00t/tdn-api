import type {
    RecoveryPayload,
    UserPayload,
} from "@core/ports/services/auth-token.port";
import "@fastify/jwt";

declare module "@fastify/jwt" {
    interface FastifyJWT {
        // Two kinds of token are signed with the same secret: the access token
        // that identifies a user, and the short-lived account recovery token.
        payload: UserPayload | RecoveryPayload;

        // Only an access token ever reaches `request.user`, because the
        // recovery token is verified explicitly by the recovery use case.
        user: UserPayload;
    }
}
