import { beforeEach, describe, expect, it, vi } from "vitest";
import { GithubLoginUseCase } from "@core/use-cases/oauth/oauth-github";
import type { GithubAuthPort } from "@core/ports/services/github-auth.port";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { AuthTokenPort } from "@core/ports/services/auth-token.port";
import type { CryptoPort } from "@core/ports/services/crypto.port";
import type { CachePort } from "@core/ports/services/cache.port";
import { AccountBannedError, AccountPendingDeletionError } from "@core/errors";
import { buildUser } from "../../../helpers/mock-factories";

const mockProfile = {
    providerAccountId: "gh-123",
    username: "ghuser",
    email: "ghuser@example.com",
    isEmailVerified: true,
};

describe("GithubLoginUseCase", () => {
    let useCase: GithubLoginUseCase;
    let githubAuthService: Pick<GithubAuthPort, "getUserProfileByCode">;
    let userRepository: Pick<
        IUserRepository,
        "findByEmail" | "findByUsername" | "createWithOAuth"
    >;
    let authTokenService: Pick<AuthTokenPort, "generateRecoveryToken">;
    let cryptoService: Pick<CryptoPort, "generateRandomHex">;
    let cacheService: Pick<CachePort, "set">;

    beforeEach(() => {
        githubAuthService = {
            getUserProfileByCode: vi.fn().mockResolvedValue(mockProfile),
        };
        userRepository = {
            findByEmail: vi.fn().mockResolvedValue(null),
            findByUsername: vi.fn().mockResolvedValue(null),
            createWithOAuth: vi
                .fn()
                .mockResolvedValue(
                    buildUser({ username: "ghuser", isEmailVerified: true }),
                ),
        };
        authTokenService = {
            generateRecoveryToken: vi.fn().mockReturnValue("recovery-token"),
        };
        cryptoService = {
            generateRandomHex: vi.fn().mockReturnValue("ab12"),
        };
        cacheService = {
            set: vi.fn().mockResolvedValue(undefined),
        };
        useCase = new GithubLoginUseCase(
            githubAuthService as GithubAuthPort,
            userRepository as IUserRepository,
            authTokenService as AuthTokenPort,
            cryptoService as CryptoPort,
            cacheService as CachePort,
        );
    });

    it("should throw AccountBannedError when the account is suspended", async () => {
        vi.mocked(userRepository.findByEmail).mockResolvedValue(
            buildUser({ bannedAt: new Date() }),
        );

        await expect(useCase.execute({ code: "auth-code" })).rejects.toThrow(
            AccountBannedError,
        );
    });

    it("should not hand a suspended account a recovery token", async () => {
        vi.mocked(userRepository.findByEmail).mockResolvedValue(
            buildUser({ bannedAt: new Date(), deletedAt: new Date() }),
        );

        await expect(useCase.execute({ code: "auth-code" })).rejects.toThrow(
            AccountBannedError,
        );
        expect(authTokenService.generateRecoveryToken).not.toHaveBeenCalled();
    });

    it("should throw AccountPendingDeletionError when user is soft-deleted", async () => {
        const deletedUser = buildUser({ deletedAt: new Date() });
        vi.mocked(userRepository.findByEmail).mockResolvedValue(deletedUser);

        await expect(useCase.execute({ code: "auth-code" })).rejects.toThrow(
            AccountPendingDeletionError,
        );

        expect(authTokenService.generateRecoveryToken).toHaveBeenCalledWith(
            deletedUser.id,
        );
    });

    it("should return exchangeCode for existing active user", async () => {
        const existingUser = buildUser({ username: "ghuser" });
        vi.mocked(userRepository.findByEmail).mockResolvedValue(existingUser);
        vi.mocked(cryptoService.generateRandomHex).mockReturnValue(
            "exchange-hex-code",
        );

        const result = await useCase.execute({ code: "auth-code" });

        expect(result).toHaveProperty("exchangeCode");
        expect(userRepository.createWithOAuth).not.toHaveBeenCalled();
    });

    it("should create new user when no account found for email", async () => {
        vi.mocked(userRepository.findByEmail).mockResolvedValue(null);
        vi.mocked(userRepository.findByUsername).mockResolvedValue(null);
        vi.mocked(cryptoService.generateRandomHex).mockReturnValue(
            "exchange-hex-code",
        );

        await useCase.execute({ code: "auth-code" });

        expect(userRepository.createWithOAuth).toHaveBeenCalledOnce();
        expect(userRepository.createWithOAuth).toHaveBeenCalledWith(
            expect.objectContaining({
                email: mockProfile.email,
                username: mockProfile.username,
                provider: "github",
                providerAccountId: mockProfile.providerAccountId,
                isEmailVerified: mockProfile.isEmailVerified,
            }),
        );
    });

    it("should append random suffix when username is already taken", async () => {
        vi.mocked(userRepository.findByEmail).mockResolvedValue(null);
        vi.mocked(userRepository.findByUsername).mockResolvedValue(
            buildUser({ username: "ghuser" }),
        );
        vi.mocked(cryptoService.generateRandomHex)
            .mockReturnValueOnce("ab12")
            .mockReturnValueOnce("exchange-hex-code");

        await useCase.execute({ code: "auth-code" });

        expect(userRepository.createWithOAuth).toHaveBeenCalledWith(
            expect.objectContaining({ username: "ghuser_ab12" }),
        );
    });

    it("should store payload in cache with correct key and TTL", async () => {
        const existingUser = buildUser({
            id: "user-1",
            username: "ghuser",
            isEmailVerified: true,
        });
        vi.mocked(userRepository.findByEmail).mockResolvedValue(existingUser);
        vi.mocked(cryptoService.generateRandomHex).mockReturnValue("deadbeef");

        await useCase.execute({ code: "auth-code" });

        expect(cacheService.set).toHaveBeenCalledOnce();
        expect(cacheService.set).toHaveBeenCalledWith(
            "oauth:exchange:deadbeef",
            JSON.stringify({
                userId: existingUser.id,
                username: existingUser.username,
                isEmailVerified: existingUser.isEmailVerified,
            }),
            60,
        );
    });
});
