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
 * What the transaction concluded.
 *
 * A compromise is reported rather than raised, because the containment it
 * calls for cannot happen inside a transaction that is about to be rolled
 * back by the very error that reports it.
 */
type RefreshOutcome =
    | { kind: "issued"; tokens: RefreshOutput }
    | { kind: "compromised"; userId: string };

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
     * @param refreshTokenRepository - Used outside the transaction, to revoke
     * a compromised chain; see the note on {@link execute}
     * @param refreshRotationGraceSeconds - How long after a rotation a reuse is
     * still treated as a retry rather than as a stolen token
     */
    constructor(
        private readonly transactionService: TransactionPort,
        private readonly authTokenService: AuthTokenPort,
        private readonly refreshTokenRepository: IRefreshTokenRepository,
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
        const outcome = await this.transactionService.runInTransaction(
            async (ctx): Promise<RefreshOutcome> => {
                const incomingTokenHash =
                    this.authTokenService.hashRefreshSecret(input.token);
                const currentToken =
                    await ctx.refreshTokenRepository.findByTokenHash(
                        incomingTokenHash,
                    );

                if (!currentToken) {
                    throw new UnauthorizedError("Session not found");
                }

                // A retired token is normally the alarm. It is a retry only when
                // it was retired moments ago and its successor is untouched.
                let tokenToRetire = currentToken;

                if (currentToken.isRevoked) {
                    const successor = await this.resolveRetry(
                        ctx.refreshTokenRepository,
                        currentToken,
                    );

                    // Reported, not acted on. Revoking here and then throwing
                    // would roll the revocation back with the transaction: the
                    // client would be told every session was killed while the
                    // stolen one kept working. The caller does it outside.
                    if (!successor)
                        return {
                            kind: "compromised" as const,
                            userId: currentToken.userId,
                        };

                    tokenToRetire = successor;
                }

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

                // A retry was served, so the token the client is still holding now
                // points at a successor this call has just retired. Left as it
                // was, the *next* retry would find that successor invalid and read
                // it as a stolen token - revoking every session the user has,
                // because the client lost two responses in a row rather than one.
                // The window itself does not move: `repoint` leaves `revokedAt`
                // where the first rotation put it.
                if (tokenToRetire !== currentToken) {
                    currentToken.repoint(issued.id);
                    await ctx.refreshTokenRepository.update(currentToken);
                }

                return {
                    kind: "issued" as const,
                    tokens: {
                        accessToken,
                        expiresAt,
                        refreshToken,
                        refreshTokenExpiresAt,
                        user: payload,
                    },
                };
            },
        );

        if (outcome.kind === "compromised") {
            // Outside the transaction, on its own connection, so it survives
            // the error that follows it.
            await this.refreshTokenRepository.revokeAllByUserId(outcome.userId);

            throw new UnauthorizedError(
                "Security alert: Session compromised. All sessions revoked.",
            );
        }

        return outcome.tokens;
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
     * Answers rather than throwing, and revokes nothing itself. The whole
     * caller runs inside a transaction, so a revocation followed by an error
     * is a revocation that never happened - the client would be told every
     * session was killed while the stolen one kept working.
     *
     * @param repository - Repository used to follow the rotation chain
     * @param retired - The retired token that was presented
     * @returns The successor to retire in its place, or null when this is a
     * genuine reuse and the chain has to be destroyed
     */
    private async resolveRetry(
        repository: IRefreshTokenRepository,
        retired: RefreshToken,
    ): Promise<RefreshToken | null> {
        const successor = retired.replacedById
            ? await repository.findById(retired.replacedById)
            : null;

        const isRetry =
            retired.wasRevokedWithin(this.refreshRotationGraceSeconds) &&
            successor !== null &&
            successor.isValid();

        return isRetry ? successor : null;
    }
}
