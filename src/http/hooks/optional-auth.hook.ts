import { UnauthorizedError } from "@core/errors";
import { type FastifyRequest } from "fastify";
import { assertAccountActive } from "./assert-account-active";

/**
 * Populates `request.user` when the request happens to carry a token.
 *
 * Used by the public read endpoints, which serve guests and signed-in readers
 * from the same route and only need an identity to work out `isLiked` and
 * `isBookmarked`.
 *
 * A request with no token returns before touching anything, so guest traffic -
 * most of what these endpoints serve - costs exactly what it did before. A
 * request that does present one is held to the same standard as anywhere else:
 * a suspended account reading as itself is still a suspended account using the
 * API. Dropping the header instead gets it a guest's view, which is all anyone
 * on the internet has anyway.
 *
 * @param request - The Fastify request object.
 * @throws {UnauthorizedError} If a token is present but invalid.
 * @throws {AccountBannedError} If the account behind the token is suspended.
 */
export async function optionalAuthHook(request: FastifyRequest): Promise<void> {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return;

    try {
        await request.jwtVerify();
    } catch {
        throw new UnauthorizedError();
    }

    await assertAccountActive(request);
}
