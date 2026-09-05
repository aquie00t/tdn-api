import { AccountBannedError, UnauthorizedError } from "@core/errors";
import type { RefreshToken } from "@core/domain/entities/refresh-token.entity";
import type {
    AuthTokenPort,
    UserPayload,
} from "@core/ports/services/auth-token.port";
import type { IRefreshTokenRepository } from "@core/ports/repositories/refresh-token.repository";
import type { TransactionPort } from "@core/ports/services/transaction.port";
import type { RefreshInput } from "./refresh.input";
import type { RefreshOutput } from "./refresh.output";

/**
 * Use case for refreshing authentication tokens.
 *
 * This use case handles the process of generating new access and refresh tokens
 * using a valid refresh token, while ensuring security by revoking the old token.
 */
export class RefreshUseCase {
    /**
     * Creates a new instance of RefreshUseCase.
     *
     * @param transactionService - Service for managing database transactions
     * @param authTokenService - Service for token operations
     * @param refreshRotationGraceSeconds - How long after a rotation a reuse is
     * still treated as a retry rather than as a stolen token
     */
    constructor(
        private readonly transactionService: TransactionPort,
        private readonly authTokenService: AuthTokenPort,
        private readonly refreshRotationGraceSeconds: number,
    ) {}

    /**
     * Executes the token refresh process.
     *
     * @param input - Refresh input containing the current refresh token and device info
     * @returns Promise<RefreshOutput> New authentication tokens and user information
     *
     * @throws UnauthorizedError - When session is invalid, expired, or compromised
     * @throws AccountBannedError - When the account has been suspended
     *
     * @remarks
     * This method validates the refresh token, revokes the old token for security,
     * and generates new access and refresh tokens within a database transaction.
     */
    async execute(input: RefreshInput): Promise<RefreshOutput> {
        return await this.transactionService.runInTransaction(async (ctx) => {
            const incomingTokenHash = this.authTokenService.hashRefreshSecret(
                input.token,
            );
            const currentToken =
                await ctx.refreshTokenRepository.findByTokenHash(
                    incomingTokenHash,
                );

            if (!currentToken) {
                throw new UnauthorizedError("Session not found");
            }

            // A retired token is normally the alarm. It is a retry only when
            // it was retired moments ago and its successor is untouched.
            const tokenToRetire = currentToken.isRevoked
                ? await this.resolveRetry(
                      ctx.refreshTokenRepository,
                      currentToken,
                  )
                : currentToken;

            if (tokenToRetire.isExpired()) {
                throw new UnauthorizedError("Session expired");
            }

            const user = await ctx.userRepository.findById(
                tokenToRetire.userId,
            );
            if (user?.isBanned()) {
                throw new AccountBannedError();
            }

            if (!user || user.isDeleted()) {
                throw new UnauthorizedError("User account unavailable");
            }

            const payload: UserPayload = {
                id: user.id,
                username: user.username,
            };

            const {
                accessToken,
                expiresAt,
                refreshToken,
                refreshTokenExpiresAt,
            } = this.authTokenService.generate(payload);

            const refreshTokenHash =
                this.authTokenService.hashRefreshSecret(refreshToken);

            const issued = await ctx.refreshTokenRepository.create({
                tokenHash: refreshTokenHash,
                userId: user.id,
                deviceIp: input.deviceIp,
                userAgent: input.userAgent,
                expiresAt: new Date(refreshTokenExpiresAt * 1000),
            });

            // Retired after the successor exists, so the chain always points
            // somewhere: a retry that arrives between these two writes finds
            // the token still live and is served by the ordinary path.
            tokenToRetire.revoke(issued.id);
            await ctx.refreshTokenRepository.update(tokenToRetire);

            return {
                accessToken,
                expiresAt,
                refreshToken,
                refreshTokenExpiresAt,
                user: payload,
            };
        });
    }

    /**
     * Decides whether a retired token is a lost-response retry or a reuse.
     *
     * The distinction matters because the response is the fragile part of a
     * rotation. A client on a mobile network regularly sends a refresh, has
     * the reply dropped, and retries with a token the server has already
     * retired - and the reuse alarm then signs the user out of every device
     * for riding a lift.
     *
     * A retry is recognised by two things together: the rotation happened
     * within the grace window, and the successor it produced has not been used
     * yet. Both have to hold. A successor that has itself been rotated means
     * somebody did receive the response, so the token presented here is a
     * second copy - which is the case the alarm exists for.
     *
     * Tokens are stored hashed, so the lost response cannot simply be replayed;
     * the retry is issued a fresh pair and the untouched successor is retired
     * with it, by the caller.
     *
     * The cost is bounded and worth stating: a thief holding a stolen token who
     * uses it inside the window is served without tripping the alarm. The alarm
     * is delayed rather than lost - the legitimate client's next refresh
     * presents a token retired outside the window, which trips it and ejects
     * both sessions.
     *
     * @param repository - Repository used to follow the rotation chain
     * @param retired - The retired token that was presented
     * @returns The successor, which the caller retires in its place
     *
     * @throws UnauthorizedError - Always, when this is a genuine reuse; every
     * session the user has is revoked first
     */
    private async resolveRetry(
        repository: IRefreshTokenRepository,
        retired: RefreshToken,
    ): Promise<RefreshToken> {
        const successor = retired.replacedById
            ? await repository.findById(retired.replacedById)
            : null;

        const isRetry =
            retired.wasRevokedWithin(this.refreshRotationGraceSeconds) &&
            successor !== null &&
            successor.isValid();

        if (!isRetry) {
            await repository.revokeAllByUserId(retired.userId);

            throw new UnauthorizedError(
                "Security alert: Session compromised. All sessions revoked.",
            );
        }

        return successor;
    }
}
