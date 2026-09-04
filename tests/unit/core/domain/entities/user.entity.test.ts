import { describe, it, expect, beforeEach } from "vitest";
import { User } from "@core/domain/entities/user.entity";
import { PostType } from "@core/domain/enums";
import type { UserProps } from "@core/domain/interfaces/user-props.interface";

function buildUserProps(overrides: Partial<UserProps> = {}): UserProps {
    return {
        id: "user-1",
        email: "test@example.com",
        username: "testuser",
        passwordHash: "hashed_password",
        isEmailVerified: false,
        isBot: false,
        deletedAt: null,
        bannedAt: null,
        digestOptOutAt: null,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-01T00:00:00Z"),
        ...overrides,
    };
}

function buildUser(overrides: Partial<UserProps> = {}): User {
    return User.with(buildUserProps(overrides));
}

describe("User Entity", () => {
    describe("Getters", () => {
        let user: User;

        beforeEach(() => {
            user = buildUser();
        });

        it("should return the correct id", () => {
            expect(user.id).toBe("user-1");
        });

        it("should return the correct email", () => {
            expect(user.email).toBe("test@example.com");
        });

        it("should return the correct username", () => {
            expect(user.username).toBe("testuser");
        });

        it("should return the correct passwordHash", () => {
            expect(user.passwordHash).toBe("hashed_password");
        });

        it("should return the correct createdAt", () => {
            expect(user.createdAt).toEqual(new Date("2024-01-01T00:00:00Z"));
        });

        it("should return the correct updatedAt", () => {
            expect(user.updatedAt).toEqual(new Date("2024-01-01T00:00:00Z"));
        });

        it("should return isEmailVerified as false by default", () => {
            expect(user.isEmailVerified).toBe(false);
        });

        it("should return isBot as false by default", () => {
            expect(user.isBot).toBe(false);
        });

        it("should return isBot as false when isBot prop is undefined", () => {
            const u = buildUser({ isBot: undefined });
            expect(u.isBot).toBe(false);
        });

        it("should return deletedAt as null by default", () => {
            expect(user.deletedAt).toBeNull();
        });
    });

    describe("isDeleted()", () => {
        it("should return false when deletedAt is null", () => {
            const user = buildUser({ deletedAt: null });
            expect(user.isDeleted()).toBe(false);
        });

        it("should return true when deletedAt is set", () => {
            const user = buildUser({ deletedAt: new Date() });
            expect(user.isDeleted()).toBe(true);
        });
    });

    describe("isBanned()", () => {
        it("should return false when bannedAt is null", () => {
            const user = buildUser({ bannedAt: null });
            expect(user.isBanned()).toBe(false);
        });

        it("should return true when bannedAt is set", () => {
            const user = buildUser({ bannedAt: new Date() });
            expect(user.isBanned()).toBe(true);
        });

        it("should expose bannedAt, null by default", () => {
            expect(buildUser().bannedAt).toBeNull();

            const bannedAt = new Date("2026-09-05T10:00:00.000Z");
            expect(buildUser({ bannedAt }).bannedAt).toStrictEqual(bannedAt);
        });

        it("should be independent of deletion", () => {
            // An account can be both, and the two answer different questions.
            const both = buildUser({
                bannedAt: new Date(),
                deletedAt: new Date(),
            });
            expect(both.isBanned()).toBe(true);
            expect(both.isDeleted()).toBe(true);

            const bannedOnly = buildUser({ bannedAt: new Date() });
            expect(bannedOnly.isDeleted()).toBe(false);

            const deletedOnly = buildUser({ deletedAt: new Date() });
            expect(deletedOnly.isBanned()).toBe(false);
        });
    });

    describe("isDigestSubscribed()", () => {
        it("should return true while the user has not opted out", () => {
            expect(
                buildUser({ digestOptOutAt: null }).isDigestSubscribed(),
            ).toBe(true);
        });

        it("should return false once the user has opted out", () => {
            const user = buildUser({ digestOptOutAt: new Date() });

            expect(user.isDigestSubscribed()).toBe(false);
        });

        it("should expose digestOptOutAt, null by default", () => {
            expect(buildUser().digestOptOutAt).toBeNull();

            const optedOutAt = new Date("2026-09-06T09:00:00.000Z");
            expect(
                buildUser({ digestOptOutAt: optedOutAt }).digestOptOutAt,
            ).toStrictEqual(optedOutAt);
        });

        it("should be independent of being banned or deleted", () => {
            const user = buildUser({
                bannedAt: new Date(),
                deletedAt: new Date(),
            });

            expect(user.isDigestSubscribed()).toBe(true);
        });
    });

    describe("hasPassword()", () => {
        it("should return true when passwordHash is set", () => {
            const user = buildUser({ passwordHash: "some_hash" });
            expect(user.hasPassword()).toBe(true);
        });

        it("should return false when passwordHash is null (OAuth user)", () => {
            const user = buildUser({ passwordHash: null });
            expect(user.hasPassword()).toBe(false);
        });
    });

    describe("hashPassword setter", () => {
        it("should update passwordHash", () => {
            const user = buildUser({ passwordHash: "old_hash" });
            user.hashPassword = "new_hash";
            expect(user.passwordHash).toBe("new_hash");
        });
    });

    describe("delete()", () => {
        it("should set deletedAt to a date", () => {
            const user = buildUser();
            const before = new Date();
            user.delete();
            const after = new Date();

            expect(user.deletedAt).not.toBeNull();
            expect(user.deletedAt!.getTime()).toBeGreaterThanOrEqual(
                before.getTime(),
            );
            expect(user.deletedAt!.getTime()).toBeLessThanOrEqual(
                after.getTime(),
            );
        });

        it("should update updatedAt on deletion", () => {
            const user = buildUser({
                updatedAt: new Date("2024-01-01T00:00:00Z"),
            });
            user.delete();
            expect(user.updatedAt.getTime()).toBeGreaterThan(
                new Date("2024-01-01T00:00:00Z").getTime(),
            );
        });

        it("should make isDeleted() return true after delete()", () => {
            const user = buildUser();
            user.delete();
            expect(user.isDeleted()).toBe(true);
        });
    });

    describe("restore()", () => {
        it("should set deletedAt back to null", () => {
            const user = buildUser({ deletedAt: new Date() });
            user.restore();
            expect(user.deletedAt).toBeNull();
        });

        it("should make isDeleted() return false after restore()", () => {
            const user = buildUser({ deletedAt: new Date() });
            user.restore();
            expect(user.isDeleted()).toBe(false);
        });

        it("should update updatedAt on restore", () => {
            const user = buildUser({
                deletedAt: new Date(),
                updatedAt: new Date("2024-01-01T00:00:00Z"),
            });
            user.restore();
            expect(user.updatedAt.getTime()).toBeGreaterThan(
                new Date("2024-01-01T00:00:00Z").getTime(),
            );
        });
    });

    describe("verifyEmail()", () => {
        it("should set isEmailVerified to true", () => {
            const user = buildUser({ isEmailVerified: false });
            user.verifyEmail();
            expect(user.isEmailVerified).toBe(true);
        });

        it("should remain true if called multiple times", () => {
            const user = buildUser({ isEmailVerified: true });
            user.verifyEmail();
            expect(user.isEmailVerified).toBe(true);
        });
    });

    describe("canCreatePostType()", () => {
        describe("regular user", () => {
            let user: User;

            beforeEach(() => {
                user = buildUser({ isBot: false });
            });

            it("should be able to create COMMUNITY posts", () => {
                expect(user.canCreatePostType(PostType.COMMUNITY)).toBe(true);
            });

            it("should be able to create JOB_POSTING posts", () => {
                expect(user.canCreatePostType(PostType.JOB_POSTING)).toBe(true);
            });

            it("should NOT be able to create SYSTEM_UPDATE posts", () => {
                expect(user.canCreatePostType(PostType.SYSTEM_UPDATE)).toBe(
                    false,
                );
            });

            it("should NOT be able to create TECH_NEWS posts", () => {
                expect(user.canCreatePostType(PostType.TECH_NEWS)).toBe(false);
            });
        });

        describe("bot user", () => {
            let bot: User;

            beforeEach(() => {
                bot = buildUser({ isBot: true });
            });

            it("should be able to create SYSTEM_UPDATE posts", () => {
                expect(bot.canCreatePostType(PostType.SYSTEM_UPDATE)).toBe(
                    true,
                );
            });

            it("should be able to create TECH_NEWS posts", () => {
                expect(bot.canCreatePostType(PostType.TECH_NEWS)).toBe(true);
            });

            it("should be able to create COMMUNITY posts", () => {
                expect(bot.canCreatePostType(PostType.COMMUNITY)).toBe(true);
            });

            it("should be able to create JOB_POSTING posts", () => {
                expect(bot.canCreatePostType(PostType.JOB_POSTING)).toBe(true);
            });
        });
    });
});
