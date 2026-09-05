import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    BeginOAuthUseCase,
    ConsumeOAuthStateUseCase,
    resolveRedirectTarget,
    type OAuthRedirectConfig,
} from "@core/use-cases/oauth/oauth-state";
import { BadRequestError } from "@core/errors";
import type { CachePort } from "@core/ports/services/cache.port";
import type { CryptoPort } from "@core/ports/services/crypto.port";
import type { GithubAuthPort } from "@core/ports/services/github-auth.port";
import type { GoogleAuthPort } from "@core/ports/services/google-auth.port";

const CONFIG: OAuthRedirectConfig = {
    frontendUrl: "https://tdn.example",
    webAllowList: ["https://beta.tdn.example/oauth-success"],
    nativeAllowList: ["tdn://oauth-success"],
};

describe("resolveRedirectTarget", () => {
    it("should send a caller that asked for nothing to the web app", () => {
        const target = resolveRedirectTarget(undefined, CONFIG);

        expect(target).toEqual({
            successUrl: "https://tdn.example/oauth-success",
            errorUrl: "https://tdn.example/login",
            delivery: "cookie",
        });
    });

    it("should deliver an allow-listed app target in the body", () => {
        expect(resolveRedirectTarget("tdn://oauth-success", CONFIG)).toEqual({
            successUrl: "tdn://oauth-success",
            errorUrl: "tdn://oauth-success",
            delivery: "body",
        });
    });

    it("should keep an allow-listed web target on the cookie", () => {
        expect(
            resolveRedirectTarget(
                "https://beta.tdn.example/oauth-success",
                CONFIG,
            )?.delivery,
        ).toBe("cookie");
    });

    it("should refuse anything not on a list", () => {
        for (const attempt of [
            "https://evil.example/oauth-success",
            // Prefix and suffix games: an exact match is the only match.
            "https://tdn.example.evil.test/oauth-success",
            "https://beta.tdn.example/oauth-success/../../steal",
            "https://beta.tdn.example/oauth-success?next=https://evil.example",
            "//evil.example",
            "tdn://oauth-success-evil",
            "javascript:alert(1)",
        ]) {
            expect(resolveRedirectTarget(attempt, CONFIG)).toBeNull();
        }
    });

    it("should treat a trailing slash as the same target", () => {
        expect(
            resolveRedirectTarget("tdn://oauth-success/", CONFIG)?.delivery,
        ).toBe("body");
    });
});

describe("BeginOAuthUseCase", () => {
    let cache: Pick<CachePort, "set" | "get" | "delete">;
    let crypto: Pick<CryptoPort, "generateRandomHex">;
    let github: Pick<GithubAuthPort, "getAuthorizationUrl">;
    let google: Pick<GoogleAuthPort, "getAuthorizationUrl">;
    let useCase: BeginOAuthUseCase;

    beforeEach(() => {
        cache = {
            set: vi.fn().mockResolvedValue(undefined),
            get: vi.fn(),
            delete: vi.fn(),
        };
        crypto = { generateRandomHex: vi.fn().mockReturnValue("state-1") };
        github = {
            getAuthorizationUrl: vi.fn().mockReturnValue("https://github/auth"),
        };
        google = {
            getAuthorizationUrl: vi.fn().mockReturnValue("https://google/auth"),
        };

        useCase = new BeginOAuthUseCase(
            github as GithubAuthPort,
            google as GoogleAuthPort,
            crypto as CryptoPort,
            cache as CachePort,
            CONFIG,
        );
    });

    it("should pass the state to the provider and record the target", async () => {
        const result = await useCase.execute("github", "tdn://oauth-success");

        expect(result.authorizationUrl).toBe("https://github/auth");
        expect(github.getAuthorizationUrl).toHaveBeenCalledWith("state-1");
        expect(cache.set).toHaveBeenCalledWith(
            "oauth:state:state-1",
            JSON.stringify({
                successUrl: "tdn://oauth-success",
                errorUrl: "tdn://oauth-success",
                delivery: "body",
            }),
            expect.any(Number),
        );
    });

    it("should start a Google flow through the Google service", async () => {
        await useCase.execute("google");

        expect(google.getAuthorizationUrl).toHaveBeenCalledWith("state-1");
        expect(github.getAuthorizationUrl).not.toHaveBeenCalled();
    });

    it("should refuse a target that is not allow-listed", async () => {
        await expect(
            useCase.execute("github", "https://evil.example/steal"),
        ).rejects.toThrow(BadRequestError);

        // Nothing is minted for a flow that will not be started.
        expect(cache.set).not.toHaveBeenCalled();
    });
});

describe("ConsumeOAuthStateUseCase", () => {
    let cache: Pick<CachePort, "get" | "delete">;
    let useCase: ConsumeOAuthStateUseCase;

    beforeEach(() => {
        cache = {
            get: vi.fn(),
            delete: vi.fn().mockResolvedValue(undefined),
        };
        useCase = new ConsumeOAuthStateUseCase(cache as CachePort, CONFIG);
    });

    it("should return the recorded target and spend the state", async () => {
        vi.mocked(cache.get).mockResolvedValue(
            JSON.stringify({
                successUrl: "tdn://oauth-success",
                errorUrl: "tdn://oauth-success",
                delivery: "body",
            }),
        );

        const target = await useCase.execute("state-1");

        expect(target?.delivery).toBe("body");
        expect(cache.delete).toHaveBeenCalledWith("oauth:state:state-1");
    });

    it("should return null for a state that was never issued", async () => {
        vi.mocked(cache.get).mockResolvedValue(null);

        expect(await useCase.execute("made-up")).toBeNull();
    });

    it("should return null when the callback carries no state at all", async () => {
        // This is the shape of a forged callback, and of every callback from
        // before the state existed. Neither may complete a sign-in.
        expect(await useCase.execute(undefined)).toBeNull();
        expect(cache.get).not.toHaveBeenCalled();
    });

    it("should return null when the stored value is unreadable", async () => {
        vi.mocked(cache.get).mockResolvedValue("not json");

        expect(await useCase.execute("state-1")).toBeNull();
    });

    it("should offer the web target as the fallback", () => {
        expect(useCase.fallbackTarget()).toEqual({
            successUrl: "https://tdn.example/oauth-success",
            errorUrl: "https://tdn.example/login",
            delivery: "cookie",
        });
    });
});
