import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@core/errors";
import { GoogleLoginUseCase } from "@core/use-cases/oauth/oauth-google";
import type { GoogleAuthPort } from "@core/ports/services/google-auth.port";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { AuthTokenPort } from "@core/ports/services/auth-token.port";
import type { CryptoPort } from "@core/ports/services/crypto.port";
import type { CachePort } from "@core/ports/services/cache.port";
import { AccountBannedError, AccountPendingDeletionError } from "@core/errors";
import { buildUser } from "../../../helpers/mock-factories";

const mockProfile = {
    providerAccountId: "google-456",
    username: "googleuser",
    email: "googleuser@example.com",
    isEmailVerified: true,
};

describe("GoogleLoginUseCase", () => {
    let useCase: GoogleLoginUseCase;
    let googleAuthService: Pick<GoogleAuthPort, "getUserProfileByCode">;
    let userRepository: Pick<
        IUserRepository,
        "findByEmail" | "findByUsername" | "createWithOAuth"
    >;
    let authTokenService: Pick<AuthTokenPort, "generateRecoveryToken">;
    let cryptoService: Pick<CryptoPort, "generateRandomHex">;
    let cacheService: Pick<CachePort, "set">;

    beforeEach(() => {
        googleAuthService = {
            getUserProfileByCode: vi.fn().mockResolvedValue(mockProfile),
        };
        userRepository = {
            findByEmail: vi.fn().mockResolvedValue(null),
            findByUsername: vi.fn().mockResolvedValue(null),
            createWithOAuth: vi.fn().mockResolvedValue(
                buildUser({
                    username: "googleuser",
                    isEmailVerified: true,
                }),
            ),
        };
        authTokenService = {
            generateRecoveryToken: vi.fn().mockReturnValue("recovery-token"),
        };
        cryptoService = {
            generateRandomHex: vi.fn().mockReturnValue("cd34"),
        };
        cacheService = {
            set: vi.fn().mockResolvedValue(undefined),
        };
        useCase = new GoogleLoginUseCase(
            googleAuthService as GoogleAuthPort,
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
        const existingUser = buildUser({ username: "googleuser" });
        vi.mocked(userRepository.findByEmail).mockResolvedValue(existingUser);
        vi.mocked(cryptoService.generateRandomHex).mockReturnValue(
            "exchange-hex-code",
        );

        const result = await useCase.execute({ code: "auth-code" });

        expect(result).toHaveProperty("exchangeCode");
        expect(userRepository.createWithOAuth).not.toHaveBeenCalled();
    });

    it("should carry the provider's verification flag onto the new account", async () => {
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
                provider: "google",
                providerAccountId: mockProfile.providerAccountId,
                isEmailVerified: true,
            }),
        );
    });

    it("should append random suffix when username is already taken", async () => {
        vi.mocked(userRepository.findByEmail).mockResolvedValue(null);
        vi.mocked(userRepository.findByUsername).mockResolvedValue(
            buildUser({ username: "googleuser" }),
        );
        vi.mocked(cryptoService.generateRandomHex)
            .mockReturnValueOnce("cd34")
            .mockReturnValueOnce("exchange-hex-code");

        await useCase.execute({ code: "auth-code" });

        expect(userRepository.createWithOAuth).toHaveBeenCalledWith(
            expect.objectContaining({ username: "googleuser_cd34" }),
        );
    });

    it("should store payload in cache with correct key and TTL", async () => {
        const existingUser = buildUser({
            id: "user-2",
            username: "googleuser",
            isEmailVerified: true,
        });
        vi.mocked(userRepository.findByEmail).mockResolvedValue(existingUser);
        vi.mocked(cryptoService.generateRandomHex).mockReturnValue("cafebabe");

        await useCase.execute({ code: "auth-code" });

        expect(cacheService.set).toHaveBeenCalledOnce();
        expect(cacheService.set).toHaveBeenCalledWith(
            "oauth:exchange:cafebabe",
            JSON.stringify({
                userId: existingUser.id,
                username: existingUser.username,
                isEmailVerified: existingUser.isEmailVerified,
            }),
            60,
        );
    });

    it("should refuse a login on an address the provider has not verified", async () => {
        // The flow matches an existing account by email alone, so an
        // unverified address is a way into somebody else's account: register
        // at the provider with their address, authorise, and be handed their
        // session.
        vi.mocked(googleAuthService.getUserProfileByCode).mockResolvedValue({
            ...mockProfile,
            isEmailVerified: false,
        });

        await expect(useCase.execute({ code: "code", delivery: "cookie" })).rejects.toThrow(UnauthorizedError);

        expect(userRepository.findByEmail).not.toHaveBeenCalled();
    });
});
