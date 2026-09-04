import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginUseCase } from "@core/use-cases/auth/login/login.usecase";
import {
    AccountBannedError,
    AccountPendingDeletionError,
    InvalidCredentialsError,
} from "@core/errors";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { PasswordPort } from "@core/ports/services/password.port";
import type { AuthTokenPort } from "@core/ports/services/auth-token.port";
import type { IRefreshTokenRepository } from "@core/ports/repositories/refresh-token.repository";
import { buildUser } from "../../../helpers/mock-factories";

describe("LoginUseCase", () => {
    let useCase: LoginUseCase;
    let userRepo: Pick<IUserRepository, "findByIdentifier">;
    let passwordSvc: Pick<PasswordPort, "verify">;
    let authTokenSvc: Pick<
        AuthTokenPort,
        "generate" | "hashRefreshSecret" | "generateRecoveryToken"
    >;
    let refreshTokenRepo: Pick<IRefreshTokenRepository, "create">;

    const input = {
        identifier: "testuser",
        password: "plain_password",
        deviceIp: "127.0.0.1",
        userAgent: "Mozilla/5.0",
    };

    beforeEach(() => {
        userRepo = { findByIdentifier: vi.fn() };
        passwordSvc = { verify: vi.fn() };
        authTokenSvc = {
            generate: vi.fn(),
            hashRefreshSecret: vi.fn(),
            generateRecoveryToken: vi.fn(),
        };
        refreshTokenRepo = { create: vi.fn() };
        useCase = new LoginUseCase(
            userRepo as IUserRepository,
            passwordSvc as PasswordPort,
            authTokenSvc as AuthTokenPort,
            refreshTokenRepo as IRefreshTokenRepository,
        );
    });

    it("should throw InvalidCredentialsError when user does not exist", async () => {
        vi.mocked(userRepo.findByIdentifier).mockResolvedValue(null);
        await expect(useCase.execute(input)).rejects.toThrow(
            InvalidCredentialsError,
        );
    });

    it("should throw InvalidCredentialsError when user has no password (OAuth user)", async () => {
        const oauthUser = buildUser({ passwordHash: null });
        vi.mocked(userRepo.findByIdentifier).mockResolvedValue(oauthUser);
        await expect(useCase.execute(input)).rejects.toThrow(
            InvalidCredentialsError,
        );
    });

    it("should throw InvalidCredentialsError when password is wrong", async () => {
        const user = buildUser();
        vi.mocked(userRepo.findByIdentifier).mockResolvedValue(user);
        vi.mocked(passwordSvc.verify).mockResolvedValue(false);
        await expect(useCase.execute(input)).rejects.toThrow(
            InvalidCredentialsError,
        );
    });

    it("should throw AccountPendingDeletionError when account is soft-deleted", async () => {
        const deletedUser = buildUser({ deletedAt: new Date() });
        vi.mocked(userRepo.findByIdentifier).mockResolvedValue(deletedUser);
        vi.mocked(passwordSvc.verify).mockResolvedValue(true);
        vi.mocked(authTokenSvc.generateRecoveryToken).mockReturnValue(
            "account_recovery",
        );
        await expect(useCase.execute(input)).rejects.toThrow(
            AccountPendingDeletionError,
        );
    });

    it("should throw AccountBannedError when the account is suspended", async () => {
        vi.mocked(userRepo.findByIdentifier).mockResolvedValue(
            buildUser({ bannedAt: new Date() }),
        );
        vi.mocked(passwordSvc.verify).mockResolvedValue(true);

        await expect(useCase.execute(input)).rejects.toThrow(
            AccountBannedError,
        );
        expect(refreshTokenRepo.create).not.toHaveBeenCalled();
    });

    it("should not hand a suspended account a recovery token", async () => {
        // A ban outranks a pending deletion: recovering out of it would undo
        // the ban, which is not the account owner's to undo.
        vi.mocked(userRepo.findByIdentifier).mockResolvedValue(
            buildUser({ bannedAt: new Date(), deletedAt: new Date() }),
        );
        vi.mocked(passwordSvc.verify).mockResolvedValue(true);

        await expect(useCase.execute(input)).rejects.toThrow(
            AccountBannedError,
        );
        expect(authTokenSvc.generateRecoveryToken).not.toHaveBeenCalled();
    });

    it("should reject a suspended account before checking nothing else", async () => {
        // The password is still verified first: neither state is worth
        // revealing to somebody who cannot prove the account is theirs.
        vi.mocked(userRepo.findByIdentifier).mockResolvedValue(
            buildUser({ bannedAt: new Date() }),
        );
        vi.mocked(passwordSvc.verify).mockResolvedValue(false);

        await expect(useCase.execute(input)).rejects.toThrow(
            InvalidCredentialsError,
        );
    });

    it("should return tokens and user info on valid credentials", async () => {
        const user = buildUser();
        vi.mocked(userRepo.findByIdentifier).mockResolvedValue(user);
        vi.mocked(passwordSvc.verify).mockResolvedValue(true);
        vi.mocked(authTokenSvc.generate).mockReturnValue({
            accessToken: "access_token",
            refreshToken: "refresh_token",
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
            refreshTokenExpiresAt:
                Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
        });
        vi.mocked(authTokenSvc.hashRefreshSecret).mockReturnValue(
            "hashed_secret",
        );
        const result = await useCase.execute(input);
        expect(result.tokens.accessToken).toBe("access_token");
        expect(result.tokens.refreshToken).toBe("refresh_token");
        expect(refreshTokenRepo.create).toHaveBeenCalledOnce();
    });
});
