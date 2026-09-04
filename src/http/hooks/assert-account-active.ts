import { AccountBannedError, UnauthorizedError } from "@core/errors";
import type { FastifyRequest } from "fastify";

/**
 * Confirms the account behind a verified token may still use the API.
 *
 * A JWT proves who signed in, not that the account is still allowed in, and
 * this one carries fifteen minutes of authority. Checking the row is what makes
 * a ban immediate rather than something that starts working once the token
 * happens to expire - which is the whole point when the account being removed
 * is one that is actively abusing the platform.
 *
 * The cost is one primary-key lookup selecting a single column, and it is paid
 * only by requests that present a token. Guests reading public endpoints touch
 * the database no more than they did before.
 *
 * @param request - The request whose `user` was just populated from the token
 * @throws UnauthorizedError - When the account no longer exists
 * @throws AccountBannedError - When the account is suspended
 */
export async function assertAccountActive(
    request: FastifyRequest,
): Promise<void> {
    const userId = request.user.id;

    const account = await request.server.prisma.user.findUnique({
        where: { id: userId },
        select: { bannedAt: true },
    });

    // A token outliving its account was already possible: the purge job hard
    // deletes users, and nothing downstream re-checked. The lookup is being
    // paid for anyway, so close that too.
    if (!account) {
        throw new UnauthorizedError();
    }

    if (account.bannedAt) {
        disconnectSocket(request, userId);
        throw new AccountBannedError();
    }
}

/**
 * Closes a banned user's live socket, if this process is holding it.
 *
 * A ban is applied straight to the database, so nothing tells the application
 * it happened and there is no moment at which to push the socket shut. Instead
 * the next request the banned client makes does it: an app in someone's hands
 * makes one within seconds, and that request both fails and takes the socket
 * with it.
 *
 * Best effort by design. `WebSocketManager` is an in-process map, so a socket
 * held by another instance survives until it drops on its own. The banned user
 * can act through none of it - every write is an HTTP request - they may just
 * keep receiving events for a while. Closing that gap would mean a new event
 * type on the Redis channel, which is not worth it for a passive read.
 *
 * @param request - The request being rejected
 * @param userId - The account whose socket should go
 */
function disconnectSocket(request: FastifyRequest, userId: string): void {
    try {
        const { wsManager } = request.server.diContainer.cradle;
        wsManager.getClient(userId)?.close(1008, "Account suspended");
    } catch (err: unknown) {
        // Never let tidying up a socket change what the request answers.
        request.log.warn(
            { err, userId },
            "Failed to close the socket of a banned user",
        );
    }
}
