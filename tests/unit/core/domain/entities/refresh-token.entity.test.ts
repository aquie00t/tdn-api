import { describe, it, expect } from "vitest";
import { RefreshToken } from "@core/domain/entities/refresh-token.entity";
import type { RefreshTokenProps } from "@core/domain/interfaces/refresh-token.props.interface";

function buildProps(
    overrides: Partial<RefreshTokenProps> = {},
): RefreshTokenProps {
    return {
        id: "token-1",
        tokenHash: "hashed_token",
        userId: "user-1",
        deviceIp: "127.0.0.1",
        userAgent: "Mozilla/5.0",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isRevoked: false,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-01T00:00:00Z"),
        ...overrides,
    };
}

describe("RefreshToken Entity", () => {
    describe("Getters", () => {
        it("should return correct id", () => {
            const token = RefreshToken.with(buildProps());
            expect(token.id).toBe("token-1");
        });

        it("should return correct tokenHash", () => {
            const token = RefreshToken.with(buildProps());
            expect(token.tokenHash).toBe("hashed_token");
        });

        it("should return correct userId", () => {
            const token = RefreshToken.with(buildProps());
            expect(token.userId).toBe("user-1");
        });

        it("should return correct deviceIp", () => {
            const token = RefreshToken.with(buildProps());
            expect(token.deviceIp).toBe("127.0.0.1");
        });

        it("should return correct userAgent", () => {
            const token = RefreshToken.with(buildProps());
            expect(token.userAgent).toBe("Mozilla/5.0");
        });

        it("should return correct createdAt", () => {
            const token = RefreshToken.with(buildProps());
            expect(token.createdAt).toEqual(new Date("2024-01-01T00:00:00Z"));
        });

        it("should return correct updatedAt", () => {
            const token = RefreshToken.with(buildProps());
            expect(token.updatedAt).toEqual(new Date("2024-01-01T00:00:00Z"));
        });

        it("should return isRevoked as false when not revoked", () => {
            const token = RefreshToken.with(buildProps({ isRevoked: false }));
            expect(token.isRevoked).toBe(false);
        });
    });

    describe("isExpired()", () => {
        it("should return false when token has not expired", () => {
            const token = RefreshToken.with(
                buildProps({
                    expiresAt: new Date(Date.now() + 60_000),
                }),
            );
            expect(token.isExpired()).toBe(false);
        });

        it("should return true when token has expired", () => {
            const token = RefreshToken.with(
                buildProps({
                    expiresAt: new Date(Date.now() - 1000),
                }),
            );
            expect(token.isExpired()).toBe(true);
        });
    });

    describe("isValid()", () => {
        it("should return true when not revoked and not expired", () => {
            const token = RefreshToken.with(
                buildProps({
                    isRevoked: false,
                    expiresAt: new Date(Date.now() + 60_000),
                }),
            );
            expect(token.isValid()).toBe(true);
        });

        it("should return false when revoked (not expired)", () => {
            const token = RefreshToken.with(
                buildProps({
                    isRevoked: true,
                    expiresAt: new Date(Date.now() + 60_000),
                }),
            );
            expect(token.isValid()).toBe(false);
        });

        it("should return false when expired (not revoked)", () => {
            const token = RefreshToken.with(
                buildProps({
                    isRevoked: false,
                    expiresAt: new Date(Date.now() - 1000),
                }),
            );
            expect(token.isValid()).toBe(false);
        });

        it("should return false when both revoked and expired", () => {
            const token = RefreshToken.with(
                buildProps({
                    isRevoked: true,
                    expiresAt: new Date(Date.now() - 1000),
                }),
            );
            expect(token.isValid()).toBe(false);
        });
    });

    describe("revoke()", () => {
        it("should set isRevoked to true", () => {
            const token = RefreshToken.with(buildProps({ isRevoked: false }));
            token.revoke();
            expect(token.isRevoked).toBe(true);
        });

        it("should update updatedAt on revocation", () => {
            const token = RefreshToken.with(
                buildProps({
                    updatedAt: new Date("2024-01-01T00:00:00Z"),
                }),
            );
            token.revoke();
            expect(token.updatedAt.getTime()).toBeGreaterThan(
                new Date("2024-01-01T00:00:00Z").getTime(),
            );
        });

        it("should make isValid() return false after revoke()", () => {
            const token = RefreshToken.with(
                buildProps({
                    isRevoked: false,
                    expiresAt: new Date(Date.now() + 60_000),
                }),
            );
            token.revoke();
            expect(token.isValid()).toBe(false);
        });

        it("should be idempotent when called multiple times", () => {
            const token = RefreshToken.with(buildProps({ isRevoked: false }));
            token.revoke();
            token.revoke();
            expect(token.isRevoked).toBe(true);
        });
    });

    describe("rotation bookkeeping", () => {
        it("should record when it was retired and what replaced it", () => {
            const token = RefreshToken.with(buildProps({ isRevoked: false }));

            token.revoke("token-2");

            expect(token.isRevoked).toBe(true);
            expect(token.replacedById).toBe("token-2");
            expect(token.revokedAt).toBeInstanceOf(Date);
        });

        it("should leave the successor null for a plain revoke", () => {
            const token = RefreshToken.with(buildProps({ isRevoked: false }));

            token.revoke();

            expect(token.replacedById).toBeNull();
        });

        it("should report a recent retirement as inside the window", () => {
            const token = RefreshToken.with(
                buildProps({
                    isRevoked: true,
                    revokedAt: new Date(Date.now() - 5_000),
                }),
            );

            expect(token.wasRevokedWithin(30)).toBe(true);
        });

        it("should report an old retirement as outside the window", () => {
            const token = RefreshToken.with(
                buildProps({
                    isRevoked: true,
                    revokedAt: new Date(Date.now() - 120_000),
                }),
            );

            expect(token.wasRevokedWithin(30)).toBe(false);
        });

        it("should report false when the retirement was never timestamped", () => {
            // Rows that predate the column. Falling through to the alarm is
            // the safe answer, not past it.
            const token = RefreshToken.with(
                buildProps({ isRevoked: true, revokedAt: null }),
            );

            expect(token.wasRevokedWithin(30)).toBe(false);
        });
    });
});
