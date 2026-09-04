import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "../../../../src/generated/prisma/client";
import { PrismaUserRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-user.repository";
import { UserAlreadyExistsError } from "../../../../src/core/errors";
import { createPrismaClient } from "../../helpers/setup";

describe("PrismaUserRepository (integration)", () => {
    let prisma: PrismaClient;
    let repo: PrismaUserRepository;

    beforeAll(async () => {
        prisma = createPrismaClient();
        repo = new PrismaUserRepository(prisma, { gracePeriodDays: 30 });
    });

    afterAll(async () => {
        await prisma.user.deleteMany({
            where: { email: { contains: "@user-repo-test.com" } },
        });
        await prisma.$disconnect();
    });

    describe("create()", () => {
        it("should create a user and return a domain entity", async () => {
            const user = await repo.create({
                email: "alice@user-repo-test.com",
                username: "alice_userrepo",
                passwordHash: "hashed_password",
            });

            expect(user.id).toBeDefined();
            expect(user.email).toBe("alice@user-repo-test.com");
            expect(user.username).toBe("alice_userrepo");
            expect(user.deletedAt).toBeNull();
        });

        it("should persist profile row alongside the user", async () => {
            const user = await repo.create({
                email: "profilecheck@user-repo-test.com",
                username: "profilecheck_userrepo",
                passwordHash: "hashed_password",
            });

            const profile = await prisma.profile.findUnique({
                where: { userId: user.id },
            });

            expect(profile).not.toBeNull();
            expect(profile!.fullName).toBe("profilecheck_userrepo");
        });

        it("should throw UserAlreadyExistsError on duplicate email", async () => {
            await repo.create({
                email: "duplicate@user-repo-test.com",
                username: "dup_user_repo1",
                passwordHash: "hashed_password",
            });

            await expect(
                repo.create({
                    email: "duplicate@user-repo-test.com",
                    username: "dup_user_repo2",
                    passwordHash: "hashed_password",
                }),
            ).rejects.toBeInstanceOf(UserAlreadyExistsError);
        });
    });

    describe("createWithOAuth()", () => {
        it("should create user with oauth account and profile", async () => {
            const user = await repo.createWithOAuth({
                email: "oauth@user-repo-test.com",
                username: "oauth_userrepo",
                provider: "github",
                providerAccountId: "gh_12345_userrepo",
                isEmailVerified: true,
            });

            expect(user.id).toBeDefined();
            expect(user.email).toBe("oauth@user-repo-test.com");

            const oauthAccount = await prisma.oAuthAccount.findFirst({
                where: { userId: user.id, provider: "github" },
            });
            expect(oauthAccount).not.toBeNull();
            expect(oauthAccount!.providerAccountId).toBe("gh_12345_userrepo");

            const profile = await prisma.profile.findUnique({
                where: { userId: user.id },
            });
            expect(profile).not.toBeNull();
        });
    });

    describe("findByIdentifier()", () => {
        let userId: string;

        beforeAll(async () => {
            const user = await repo.create({
                email: "finder@user-repo-test.com",
                username: "finder_userrepo",
                passwordHash: "hashed",
            });
            userId = user.id;
        });

        it("should find user by email", async () => {
            const user = await repo.findByIdentifier(
                "finder@user-repo-test.com",
            );
            expect(user).not.toBeNull();
            expect(user!.id).toBe(userId);
        });

        it("should find user by username", async () => {
            const user = await repo.findByIdentifier("finder_userrepo");
            expect(user).not.toBeNull();
            expect(user!.id).toBe(userId);
        });

        it("should return null for unknown identifier", async () => {
            const user = await repo.findByIdentifier(
                "nonexistent_xyz@user-repo-test.com",
            );
            expect(user).toBeNull();
        });
    });

    describe("findById()", () => {
        it("should find user by id", async () => {
            const created = await repo.create({
                email: "findbyid@user-repo-test.com",
                username: "findbyid_userrepo",
                passwordHash: "hashed",
            });

            const found = await repo.findById(created.id);
            expect(found).not.toBeNull();
            expect(found!.id).toBe(created.id);
        });

        it("should return null for non-existent id", async () => {
            const found = await repo.findById(
                "00000000-0000-0000-0000-000000000000",
            );
            expect(found).toBeNull();
        });
    });

    describe("findByEmail()", () => {
        it("should find user by email", async () => {
            const created = await repo.create({
                email: "byemail@user-repo-test.com",
                username: "byemail_userrepo",
                passwordHash: "hashed",
            });

            const found = await repo.findByEmail("byemail@user-repo-test.com");
            expect(found).not.toBeNull();
            expect(found!.id).toBe(created.id);
        });

        it("should return null for unknown email", async () => {
            const found = await repo.findByEmail("ghost@user-repo-test.com");
            expect(found).toBeNull();
        });
    });

    describe("softDeleteById() / restoreById()", () => {
        it("should set deletedAt on soft delete", async () => {
            const user = await repo.create({
                email: "softdel@user-repo-test.com",
                username: "softdel_userrepo",
                passwordHash: "hashed",
            });

            await repo.softDeleteById(user.id);

            const row = await prisma.user.findUnique({
                where: { id: user.id },
            });
            expect(row!.deletedAt).not.toBeNull();
        });

        it("should clear deletedAt on restore", async () => {
            const user = await repo.create({
                email: "restore@user-repo-test.com",
                username: "restore_userrepo",
                passwordHash: "hashed",
            });

            await repo.softDeleteById(user.id);
            await repo.restoreById(user.id);

            const row = await prisma.user.findUnique({
                where: { id: user.id },
            });
            expect(row!.deletedAt).toBeNull();
        });
    });
    describe("findManyByUsernames()", () => {
        it("should resolve a batch of handles to id and username pairs", async () => {
            const ada = await repo.create({
                email: "ada@user-repo-test.com",
                username: "ada_userrepo",
                passwordHash: "hashed",
            });
            const zoe = await repo.create({
                email: "zoe@user-repo-test.com",
                username: "zoe_userrepo",
                passwordHash: "hashed",
            });

            const found = await repo.findManyByUsernames([
                "ada_userrepo",
                "zoe_userrepo",
            ]);

            expect(found).toHaveLength(2);
            expect(found).toEqual(
                expect.arrayContaining([
                    { id: ada.id, username: "ada_userrepo" },
                    { id: zoe.id, username: "zoe_userrepo" },
                ]),
            );
        });

        it("should match a handle typed in a different case", async () => {
            const user = await repo.create({
                email: "casing@user-repo-test.com",
                username: "Casing_UserRepo",
                passwordHash: "hashed",
            });

            const found = await repo.findManyByUsernames(["casing_userrepo"]);

            // The stored casing comes back, not what the author typed: it is
            // the handle every other reader will see.
            expect(found).toEqual([
                { id: user.id, username: "Casing_UserRepo" },
            ]);
        });

        it("should return one row for a handle that matches only one account", async () => {
            await repo.create({
                email: "single@user-repo-test.com",
                username: "single_userrepo",
                passwordHash: "hashed",
            });

            const found = await repo.findManyByUsernames(["single_userrepo"]);

            expect(found).toHaveLength(1);
        });

        it("should leave out a soft-deleted account", async () => {
            const user = await repo.create({
                email: "gone@user-repo-test.com",
                username: "gone_userrepo",
                passwordHash: "hashed",
            });
            await repo.softDeleteById(user.id);

            const found = await repo.findManyByUsernames(["gone_userrepo"]);

            expect(found).toEqual([]);
        });

        it("should silently drop a handle nobody owns", async () => {
            const found = await repo.findManyByUsernames([
                "nobody_owns_this_handle",
            ]);

            expect(found).toEqual([]);
        });

        it("should not query at all for an empty batch", async () => {
            expect(await repo.findManyByUsernames([])).toEqual([]);
        });
    });

    describe("bannedAt", () => {
        it("should default to null on a new account", async () => {
            const user = await repo.create({
                email: "unbanned@user-repo-test.com",
                username: "unbanned_userrepo",
                passwordHash: "hashed",
            });

            expect(user.bannedAt).toBeNull();
            expect(user.isBanned()).toBe(false);
        });

        it("should round-trip a ban applied straight to the column", async () => {
            // Exactly how a ban is applied in production: a hand-written
            // UPDATE, with no application code involved.
            const created = await repo.create({
                email: "banned@user-repo-test.com",
                username: "banned_userrepo",
                passwordHash: "hashed",
            });

            const bannedAt = new Date("2026-09-05T10:00:00.000Z");
            await prisma.user.update({
                where: { id: created.id },
                data: { bannedAt },
            });

            const reloaded = await repo.findById(created.id);
            expect(reloaded!.bannedAt).toStrictEqual(bannedAt);
            expect(reloaded!.isBanned()).toBe(true);
        });

        it("should read as unbanned again once the column is cleared", async () => {
            const created = await repo.create({
                email: "lifted@user-repo-test.com",
                username: "lifted_userrepo",
                passwordHash: "hashed",
            });

            await prisma.user.update({
                where: { id: created.id },
                data: { bannedAt: new Date() },
            });
            await prisma.user.update({
                where: { id: created.id },
                data: { bannedAt: null },
            });

            const reloaded = await repo.findById(created.id);
            expect(reloaded!.isBanned()).toBe(false);
        });
    });
});
