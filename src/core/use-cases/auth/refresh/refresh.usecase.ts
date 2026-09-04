import { AccountBannedError, UnauthorizedError } from "@core/errors";
import type {
    AuthTokenPort,
    UserPayload,
} from "@core/ports/services/auth-token.port";
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
     */
    constructor(
        private readonly transactionService: TransactionPort,
        private readonly authTokenService: AuthTokenPort,
    ) {}

    /**
     * Executes the token refresh process.
     *
     * @param input - Refresh input containing the current refresh token and device info
     * @returns Promise<RefreshOutput> New authentication tokens and user information
     *
     * @throws UnauthorizedError - When session is invalid, expired, or compromised
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

            if (currentToken.isRevoked) {
                await ctx.refreshTokenRepository.revokeAllByUserId(
                    currentToken.userId,
                );

                throw new UnauthorizedError(
                    "Security alert: Session compromised. All sessions revoked.",
                );
            }

            if (currentToken.isExpired()) {
                throw new UnauthorizedError("Session expired");
            }

            const user = await ctx.userRepository.findById(currentToken.userId);
            if (user?.isBanned()) {
                throw new AccountBannedError();
            }

            if (!user || user.isDeleted()) {
                throw new UnauthorizedError("User account unavailable");
            }

            currentToken.revoke();
            await ctx.refreshTokenRepository.update(currentToken);

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

            await ctx.refreshTokenRepository.create({
                tokenHash: refreshTokenHash,
                userId: user.id,
                deviceIp: input.deviceIp,
                userAgent: input.userAgent,
                expiresAt: new Date(refreshTokenExpiresAt * 1000),
            });

            return {
                accessToken,
                expiresAt,
                refreshToken,
                refreshTokenExpiresAt,
                user: payload,
            };
        });
    }
}
