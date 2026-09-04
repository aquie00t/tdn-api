import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { IRefreshTokenRepository } from "@core/ports/repositories/refresh-token.repository";
import type {
    AuthTokenPort,
    RecoveryPayload,
} from "@core/ports/services/auth-token.port";
import { AccountBannedError, UnauthorizedError } from "@core/errors";
import { type LoginOutput } from "../login/login.output";
import type { RecoverAccountInput } from "./recover-account.input";
import { AuthMapper } from "../auth.mapper";

/**
 * Use case for recovering a deleted user account.
 *
 * This use case handles the process of restoring a user account that was
 * previously soft-deleted, using a valid recovery token.
 */
export class RecoverAccountUseCase {
    /**
     * Creates a new instance of RecoverAccountUseCase.
     *
     * @param userRepository - Repository for managing user data
     * @param refreshTokenRepository - Repository for persisting refresh tokens
     * @param authTokenService - Service for token operations
     */
    constructor(
        private readonly userRepository: IUserRepository,
        private readonly refreshTokenRepository: IRefreshTokenRepository,
        private readonly authTokenService: AuthTokenPort,
    ) {}

    /**
     * Executes the account recovery process.
     *
     * @param input - Recovery input containing the recovery token
     * @returns Promise<LoginOutput> Authentication tokens and user information
     *
     * @throws UnauthorizedError - When recovery token is invalid or expired
     * @throws BadRequestError - When user is not found
     *
     * @remarks
     * This method verifies the recovery token, restores the user account,
     * and generates new authentication tokens for the recovered account.
     */
    async execute(input: RecoverAccountInput): Promise<LoginOutput> {
        let payload: RecoveryPayload;

        try {
            payload = this.authTokenService.verifyRecoveryToken(
                input.recoveryToken,
            );
        } catch {
            throw new UnauthorizedError("Invalid or expired recovery token.");
        }

        if (payload.purpose !== "account_recovery") {
            throw new UnauthorizedError("Invalid token purpose.");
        }

        const userId = payload.sub;

        const user = await this.userRepository.findById(userId);

        // A suspended account stays suspended: recovery undoes a deletion the
        // owner asked for, not a ban somebody else applied.
        if (user?.isBanned()) {
            throw new AccountBannedError();
        }

        if (!user || !user.isDeleted()) {
            throw new UnauthorizedError("Invalid or expired recovery token.");
        }

        await this.userRepository.restoreById(user.id);

        const { accessToken, expiresAt, refreshToken, refreshTokenExpiresAt } =
            this.authTokenService.generate({
                id: user.id,
                username: user.username,
            });

        const refreshTokenHash =
            this.authTokenService.hashRefreshSecret(refreshToken);

        await this.refreshTokenRepository.create({
            tokenHash: refreshTokenHash,
            userId: user.id,
            deviceIp: input.deviceIp,
            userAgent: input.userAgent,
            expiresAt: new Date(refreshTokenExpiresAt * 1000),
        });

        return {
            user: {
                id: user.id,
                username: user.username,
                isEmailVerified: user.isEmailVerified,
            },
            tokens: AuthMapper.toTokenOutput({
                accessToken,
                expiresAt,
                refreshToken,
                refreshTokenExpiresAt,
            }),
        };
    }
}
