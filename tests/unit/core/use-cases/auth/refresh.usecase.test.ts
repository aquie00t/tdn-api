import { beforeEach, describe, expect, it, vi } from "vitest";
import { RefreshUseCase } from "@core/use-cases/auth/refresh/refresh.usecase";
import { AccountBannedError, UnauthorizedError } from "@core/errors";
import type {
    TransactionPort,
    TransactionContext,
} from "@core/ports/services/transaction.port";
import type { AuthTokenPort } from "@core/ports/services/auth-token.port";
import type { IRefreshTokenRepository } from "@core/ports/repositories/refresh-token.repository";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import { buildUser, buildRefreshToken } from "../../../helpers/mock-factories";

const GRACE_SECONDS = 30;

describe("RefreshUseCase", () => {
    let useCase: RefreshUseCase;
    let refreshTokenRepo: Pick<
        IRefreshTokenRepository,
        | "findByTokenHash"
        | "findById"
        | "revokeAllByUserId"
        | "update"
        | "create"
    >;
    let userRepo: Pick<IUserRepository, "findById">;
    let transactionSvc: Pick<TransactionPort, "runInTransaction">;
    let authTokenSvc: Pick<AuthTokenPort, "hashRefreshSecret" | "generate">;

    const input = {
        token: "raw_refresh_token",
        deviceIp: "127.0.0.1",
        userAgent: "Mozilla/5.0",
    };

    beforeEach(() => {
        refreshTokenRepo = {
            findByTokenHash: vi.fn(),
            findById: vi.fn(),
            revokeAllByUserId: vi.fn(),
            update: vi.fn(),
            create: vi.fn(),
        };
        userRepo = { findById: vi.fn() };
        transactionSvc = {
            runInTransaction: vi.fn((fn) =>
                fn({
                    refreshTokenRepository: refreshTokenRepo,
                    userRepository: userRepo,
                } as unknown as TransactionContext),
            ),
        };
        authTokenSvc = {
            hashRefreshSecret: vi.fn(),
            generate: vi.fn(),
        };
        useCase = new RefreshUseCase(
            transactionSvc as TransactionPort,
            authTokenSvc as AuthTokenPort,
            GRACE_SECONDS,
        );
    });

    it("should throw UnauthorizedError when token is not found", async () => {
        vi.mocked(authTokenSvc.hashRefreshSecret).mockReturnValue(
            "hashed_token",
        );
        vi.mocked(refreshTokenRepo.findByTokenHash).mockResolvedValue(null);

        await expect(useCase.execute(input)).rejects.toThrow(
            new UnauthorizedError("Session not found"),
        );
    });

    it("should revoke all sessions and throw when token is already revoked (token reuse attack)", async () => {
        const revokedToken = buildRefreshToken({ isRevoked: true });
        vi.mocked(authTokenSvc.hashRefreshSecret).mockReturnValue(
            "hashed_token",
        );
        vi.mocked(refreshTokenRepo.findByTokenHash).mockResolvedValue(
            revokedToken,
        );
        vi.mocked(refreshTokenRepo.revokeAllByUserId).mockResolvedValue(
            undefined,
        );

        await expect(useCase.execute(input)).rejects.toThrow(
            new UnauthorizedError(
                "Security alert: Session compromised. All sessions revoked.",
            ),
        );

        expect(refreshTokenRepo.revokeAllByUserId).toHaveBeenCalledWith(
            revokedToken.userId,
        );
    });

    it("should throw UnauthorizedError when token is expired", async () => {
        const expiredToken = buildRefreshToken({
            expiresAt: new Date(Date.now() - 1000),
        });
        vi.mocked(authTokenSvc.hashRefreshSecret).mockReturnValue(
            "hashed_token",
        );
        vi.mocked(refreshTokenRepo.findByTokenHash).mockResolvedValue(
            expiredToken,
        );

        await expect(useCase.execute(input)).rejects.toThrow(
            new UnauthorizedError("Session expired"),
        );

        expect(refreshTokenRepo.update).not.toHaveBeenCalled();
    });

    it("should throw UnauthorizedError when user is not found", async () => {
        const activeToken = buildRefreshToken();
        vi.mocked(authTokenSvc.hashRefreshSecret).mockReturnValue(
            "hashed_token",
        );
        vi.mocked(refreshTokenRepo.findByTokenHash).mockResolvedValue(
            activeToken,
        );
        vi.mocked(userRepo.findById).mockResolvedValue(null);

        await expect(useCase.execute(input)).rejects.toThrow(
            new UnauthorizedError("User account unavailable"),
        );
    });

    it("should throw UnauthorizedError when user account is soft-deleted", async () => {
        const activeToken = buildRefreshToken();
        const deletedUser = buildUser({ deletedAt: new Date() });
        vi.mocked(authTokenSvc.hashRefreshSecret).mockReturnValue(
            "hashed_token",
        );
        vi.mocked(refreshTokenRepo.findByTokenHash).mockResolvedValue(
            activeToken,
        );
        vi.mocked(userRepo.findById).mockResolvedValue(deletedUser);

        await expect(useCase.execute(input)).rejects.toThrow(
            new UnauthorizedError("User account unavailable"),
        );
    });

    it("should reject a suspended account and mint nothing", async () => {
        vi.mocked(authTokenSvc.hashRefreshSecret).mockReturnValue(
            "hashed_token",
        );
        vi.mocked(refreshTokenRepo.findByTokenHash).mockResolvedValue(
            buildRefreshToken(),
        );
        vi.mocked(userRepo.findById).mockResolvedValue(
            buildUser({ bannedAt: new Date() }),
        );

        await expect(useCase.execute(input)).rejects.toThrow(
            AccountBannedError,
        );
        expect(authTokenSvc.generate).not.toHaveBeenCalled();
        expect(refreshTokenRepo.create).not.toHaveBeenCalled();
    });

    it("should revoke old token, create new token, and return new credentials", async () => {
        const activeToken = buildRefreshToken();
        const user = buildUser();
        const newTokens = {
            accessToken: "new_access_token",
            refreshToken: "new_refresh_token",
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
            refreshTokenExpiresAt:
                Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
        };

        vi.mocked(authTokenSvc.hashRefreshSecret)
            .mockReturnValueOnce("hashed_incoming")
            .mockReturnValueOnce("hashed_new");
        vi.mocked(refreshTokenRepo.findByTokenHash).mockResolvedValue(
            activeToken,
        );
        vi.mocked(userRepo.findById).mockResolvedValue(user);
        vi.mocked(authTokenSvc.generate).mockReturnValue(newTokens);
        vi.mocked(refreshTokenRepo.update).mockResolvedValue(undefined);
        vi.mocked(refreshTokenRepo.create).mockResolvedValue(activeToken);

        const result = await useCase.execute(input);

        expect(activeToken.isRevoked).toBe(true);
        expect(refreshTokenRepo.update).toHaveBeenCalledWith(activeToken);
        expect(refreshTokenRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                tokenHash: "hashed_new",
                userId: user.id,
                deviceIp: input.deviceIp,
                userAgent: input.userAgent,
            }),
        );

        expect(result.accessToken).toBe("new_access_token");
        expect(result.refreshToken).toBe("new_refresh_token");
        expect(result.user.id).toBe(user.id);
    });

    describe("rotation grace window", () => {
        /**
         * Sets up a rotation that just happened: `retired` was replaced by
         * `successor` `secondsAgo` seconds ago, and the client is presenting
         * `retired` again because it never saw the response.
         */
        function arrangeRetry(secondsAgo: number, successorRevoked = false) {
            const successor = buildRefreshToken({
                id: "token-2",
                isRevoked: successorRevoked,
            });
            const retired = buildRefreshToken({
                id: "token-1",
                isRevoked: true,
                revokedAt: new Date(Date.now() - secondsAgo * 1000),
                replacedById: "token-2",
            });

            vi.mocked(authTokenSvc.hashRefreshSecret)
                .mockReturnValueOnce("hashed_incoming")
                .mockReturnValueOnce("hashed_new");
            vi.mocked(refreshTokenRepo.findByTokenHash).mockResolvedValue(
                retired,
            );
            vi.mocked(refreshTokenRepo.findById).mockResolvedValue(successor);
            vi.mocked(userRepo.findById).mockResolvedValue(buildUser());
            vi.mocked(authTokenSvc.generate).mockReturnValue({
                accessToken: "new_access_token",
                refreshToken: "new_refresh_token",
                expiresAt: Math.floor(Date.now() / 1000) + 3600,
                refreshTokenExpiresAt:
                    Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
            });
            vi.mocked(refreshTokenRepo.create).mockResolvedValue(
                buildRefreshToken({ id: "token-3" }),
            );

            return { retired, successor };
        }

        it("should serve a retry inside the window instead of raising the alarm", async () => {
            const { successor } = arrangeRetry(5);

            const result = await useCase.execute(input);

            expect(result.refreshToken).toBe("new_refresh_token");
            expect(refreshTokenRepo.revokeAllByUserId).not.toHaveBeenCalled();
            // The untouched successor is retired in its turn, so the chain
            // never leaves two live tokens behind.
            expect(successor.isRevoked).toBe(true);
            expect(successor.replacedById).toBe("token-3");
            expect(refreshTokenRepo.update).toHaveBeenCalledWith(successor);
        });

        it("should raise the alarm for a reuse outside the window", async () => {
            arrangeRetry(GRACE_SECONDS + 5);

            await expect(useCase.execute(input)).rejects.toThrow(
                new UnauthorizedError(
                    "Security alert: Session compromised. All sessions revoked.",
                ),
            );

            expect(refreshTokenRepo.revokeAllByUserId).toHaveBeenCalledWith(
                "user-1",
            );
        });

        it("should raise the alarm when the successor has already been used", async () => {
            arrangeRetry(5, true);

            await expect(useCase.execute(input)).rejects.toThrow(
                UnauthorizedError,
            );

            expect(refreshTokenRepo.revokeAllByUserId).toHaveBeenCalled();
        });

        it("should raise the alarm when the chain leads nowhere", async () => {
            arrangeRetry(5);
            vi.mocked(refreshTokenRepo.findById).mockResolvedValue(null);

            await expect(useCase.execute(input)).rejects.toThrow(
                UnauthorizedError,
            );

            expect(refreshTokenRepo.revokeAllByUserId).toHaveBeenCalled();
        });

        it("should raise the alarm for a token revoked before the column existed", async () => {
            const legacy = buildRefreshToken({
                isRevoked: true,
                revokedAt: null,
                replacedById: null,
            });
            vi.mocked(authTokenSvc.hashRefreshSecret).mockReturnValue(
                "hashed_token",
            );
            vi.mocked(refreshTokenRepo.findByTokenHash).mockResolvedValue(
                legacy,
            );

            await expect(useCase.execute(input)).rejects.toThrow(
                UnauthorizedError,
            );

            expect(refreshTokenRepo.revokeAllByUserId).toHaveBeenCalled();
        });
    });

    it("should record the successor on the token it retires", async () => {
        const activeToken = buildRefreshToken();
        vi.mocked(authTokenSvc.hashRefreshSecret)
            .mockReturnValueOnce("hashed_incoming")
            .mockReturnValueOnce("hashed_new");
        vi.mocked(refreshTokenRepo.findByTokenHash).mockResolvedValue(
            activeToken,
        );
        vi.mocked(userRepo.findById).mockResolvedValue(buildUser());
        vi.mocked(authTokenSvc.generate).mockReturnValue({
            accessToken: "new_access_token",
            refreshToken: "new_refresh_token",
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
            refreshTokenExpiresAt:
                Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
        });
        vi.mocked(refreshTokenRepo.create).mockResolvedValue(
            buildRefreshToken({ id: "token-9" }),
        );

        await useCase.execute(input);

        expect(activeToken.replacedById).toBe("token-9");
        expect(activeToken.revokedAt).not.toBeNull();
    });
});
