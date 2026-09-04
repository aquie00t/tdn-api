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

describe("RefreshUseCase", () => {
    let useCase: RefreshUseCase;
    let refreshTokenRepo: Pick<
        IRefreshTokenRepository,
        "findByTokenHash" | "revokeAllByUserId" | "update" | "create"
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
});
