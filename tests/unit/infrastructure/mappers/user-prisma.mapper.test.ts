import { describe, expect, it } from "vitest";
import { UserPrismaMapper } from "@infrastructure/persistence/mappers/user-prisma.mapper";
import type { User as PrismaUser } from "@generated/prisma/client";

const now = new Date("2025-01-01T00:00:00.000Z");

const basePrismaUser: PrismaUser = {
    id: "user-1",
    email: "test@example.com",
    username: "testuser",
    password: "hashed_password",
    isBot: false,
    isEmailVerified: true,
    deletedAt: null,
    bannedAt: null,
    digestOptOutAt: null,
    createdAt: now,
    updatedAt: now,
    botToken: null,
};

describe("UserPrismaMapper", () => {
    describe("toDomainUser", () => {
        it("should map all fields correctly", () => {
            const user = UserPrismaMapper.toDomainUser(basePrismaUser);

            expect(user.id).toBe("user-1");
            expect(user.email).toBe("test@example.com");
            expect(user.username).toBe("testuser");
            expect(user.isBot).toBe(false);
            expect(user.isEmailVerified).toBe(true);
            expect(user.createdAt).toBe(now);
            expect(user.updatedAt).toBe(now);
        });

        it("should map DB password field to entity passwordHash", () => {
            const user = UserPrismaMapper.toDomainUser(basePrismaUser);

            expect(user.passwordHash).toBe("hashed_password");
        });

        it("should map bannedAt when the account is suspended", () => {
            const bannedAt = new Date("2026-09-05T10:00:00.000Z");

            const user = UserPrismaMapper.toDomainUser({
                ...basePrismaUser,
                bannedAt,
            });

            expect(user.bannedAt).toStrictEqual(bannedAt);
            expect(user.isBanned()).toBe(true);
        });

        it("should read an unbanned account as not banned", () => {
            expect(
                UserPrismaMapper.toDomainUser(basePrismaUser).isBanned(),
            ).toBe(false);
        });

        it("should map deletedAt when user is soft-deleted", () => {
            const deletedAt = new Date("2025-06-01T00:00:00.000Z");
            const user = UserPrismaMapper.toDomainUser({
                ...basePrismaUser,
                deletedAt,
            });

            expect(user.isDeleted()).toBe(true);
            expect(user.deletedAt).toStrictEqual(deletedAt);
        });

        it("should reflect isDeleted() false when deletedAt is null", () => {
            const user = UserPrismaMapper.toDomainUser(basePrismaUser);

            expect(user.isDeleted()).toBe(false);
        });

        it("should map isBot true for bot users", () => {
            const user = UserPrismaMapper.toDomainUser({
                ...basePrismaUser,
                isBot: true,
            });

            expect(user.isBot).toBe(true);
        });
    });

    describe("toPrismaCreateUser", () => {
        it("should map passwordHash to Prisma password field", () => {
            const result = UserPrismaMapper.toPrismaCreateUser({
                email: "a@b.com",
                username: "alice",
                passwordHash: "hash_abc",
            });

            expect(result.password).toBe("hash_abc");
            expect(result.email).toBe("a@b.com");
            expect(result.username).toBe("alice");
        });

        it("should allow null passwordHash for OAuth users", () => {
            const result = UserPrismaMapper.toPrismaCreateUser({
                email: "oauth@example.com",
                username: "oauthuser",
                passwordHash: null,
            });

            expect(result.password).toBeNull();
        });
    });
});
