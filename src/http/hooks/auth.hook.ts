import { UnauthorizedError } from "@core/errors";
import { type FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { assertAccountActive } from "./assert-account-active";

/**
 * Authentication hook for Fastify requests.
 *
 * This hook checks the `Authorization` header in the incoming request and authenticates the user based on the provided token.
 *
 * - If the header starts with "Bot ", it treats the token as a bot token, hashes it, and looks up the corresponding user in the database.
 * - If the header starts with "Bearer ", it attempts to verify the JWT token.
 * - If authentication fails or the header is missing, it throws an `UnauthorizedError`.
 *
 * Either way the account itself is checked, not just the credential: a token
 * stays valid for fifteen minutes and a bot token indefinitely, so a suspended
 * account would otherwise keep working long after it was banned.
 *
 * @param request - The Fastify request object.
 * @throws {UnauthorizedError} If authentication fails or the authorization header is missing.
 * @throws {AccountBannedError} If the authenticated account is suspended.
 * @returns {Promise<void>} Resolves if authentication is successful.
 */
export async function authHook(request: FastifyRequest): Promise<void> {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
        throw new UnauthorizedError();
    }

    if (authHeader.startsWith("Bot ")) {
        const token = authHeader.replace("Bot ", "").trim();

        if (!token) throw new UnauthorizedError();

        const hashedToken = createHash("sha256").update(token).digest("hex");

        // The ban is part of the lookup rather than a second query: this path
        // already reads the row, so a suspended bot simply stops matching.
        const botUser = await request.server.prisma.user.findFirst({
            where: { botToken: hashedToken, isBot: true, bannedAt: null },
        });

        if (!botUser) {
            throw new UnauthorizedError();
        }

        request.user = botUser;
        return;
    }

    if (authHeader.startsWith("Bearer ")) {
        try {
            await request.jwtVerify();
        } catch {
            throw new UnauthorizedError();
        }

        await assertAccountActive(request);
        return;
    }

    throw new UnauthorizedError();
}
