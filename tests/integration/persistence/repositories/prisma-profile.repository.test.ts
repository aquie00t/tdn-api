import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "../../../../src/generated/prisma/client";
import { PrismaProfileRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-profile.repository";
import { PrismaUserRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-user.repository";
import { createPrismaClient } from "../../helpers/setup";
import { PostCategory } from "../../../../src/core/domain/enums/post-category-enum";

describe("PrismaProfileRepository (integration)", () => {
    let prisma: PrismaClient;
    let profileRepo: PrismaProfileRepository;
    let testUserId: string;
    let testUsername: string;

    beforeAll(async () => {
        prisma = createPrismaClient();
        profileRepo = new PrismaProfileRepository(prisma);

        const userRepo = new PrismaUserRepository(prisma, {
            gracePeriodDays: 30,
        });
        const user = await userRepo.create({
            email: "profileuser@profile-repo-test.com",
            username: "profileuser_profilerepo",
            passwordHash: "hashed",
        });
        testUserId = user.id;
        testUsername = user.username;
    });

    afterAll(async () => {
        await prisma.user.deleteMany({
            where: { email: { contains: "@profile-repo-test.com" } },
        });
        await prisma.$disconnect();
    });

    describe("findByUserId()", () => {
        it("should return the profile for an existing user", async () => {
            const profile = await profileRepo.findByUserId(testUserId);
            expect(profile).not.toBeNull();
            expect(profile!.userId).toBe(testUserId);
        });

        it("should return null for a non-existent userId", async () => {
            const profile = await profileRepo.findByUserId(
                "00000000-0000-0000-0000-000000000000",
            );
            expect(profile).toBeNull();
        });
    });

    describe("findByUsername()", () => {
        it("should return profile when found by username", async () => {
            const profile = await profileRepo.findByUsername(testUsername);
            expect(profile).not.toBeNull();
            expect(profile!.userId).toBe(testUserId);
        });

        it("should return null for unknown username", async () => {
            const profile = await profileRepo.findByUsername(
                "ghost_nonexistent_profilerepo",
            );
            expect(profile).toBeNull();
        });
    });

    describe("update()", () => {
        it("should update profile fields partially", async () => {
            await profileRepo.update(testUserId, {
                userId: testUserId,
                bio: "My integration bio",
            });

            const profile = await profileRepo.findByUserId(testUserId);
            expect(profile!.bio).toBe("My integration bio");
        });

        it("should not overwrite untouched fields", async () => {
            // First set fullName
            await profileRepo.update(testUserId, {
                userId: testUserId,
                fullName: "Test Full Name",
            });
            // Then update only bio
            await profileRepo.update(testUserId, {
                userId: testUserId,
                bio: "Bio only update",
            });

            const profile = await profileRepo.findByUserId(testUserId);
            expect(profile!.bio).toBe("Bio only update");
            expect(profile!.fullName).toBe("Test Full Name");
        });
    });

    describe("search()", () => {
        beforeAll(async () => {
            const userRepo = new PrismaUserRepository(prisma, {
                gracePeriodDays: 30,
            });
            const user2 = await userRepo.create({
                email: "searchable@profile-repo-test.com",
                username: "searchable_profilerepo",
                passwordHash: "hashed",
            });
            await profileRepo.update(user2.id, {
                userId: user2.id,
                fullName: "Searchable Person Profilerepo",
            });
        });

        it("should find profiles matching a case-insensitive query", async () => {
            const results = await profileRepo.search("SEARCHABLE", 10);
            expect(results.length).toBeGreaterThanOrEqual(1);
            const found = results.find((p) =>
                p.fullName?.toLowerCase().includes("searchable"),
            );
            expect(found).toBeDefined();
        });

        it("should return empty array when nothing matches", async () => {
            const results = await profileRepo.search(
                "zzznomatch_profilerepo_xyz",
            );
            expect(results).toHaveLength(0);
        });
    });

    describe("findBotProfiles()", () => {
        let backendBotId: string;
        let mobileBotId: string;
        let deletedBotId: string;

        beforeAll(async () => {
            const userRepo = new PrismaUserRepository(prisma, {
                gracePeriodDays: 30,
            });

            const backendBot = await userRepo.create({
                email: "backendbot@profile-repo-test.com",
                username: "backendbot_profilerepo",
                passwordHash: null,
            });
            const mobileBot = await userRepo.create({
                email: "mobilebot@profile-repo-test.com",
                username: "mobilebot_profilerepo",
                passwordHash: null,
            });
            const deletedBot = await userRepo.create({
                email: "deletedbot@profile-repo-test.com",
                username: "deletedbot_profilerepo",
                passwordHash: null,
            });

            backendBotId = backendBot.id;
            mobileBotId = mobileBot.id;
            deletedBotId = deletedBot.id;

            await prisma.user.updateMany({
                where: { id: { in: [backendBotId, mobileBotId] } },
                data: { isBot: true },
            });
            await prisma.user.update({
                where: { id: deletedBotId },
                data: { isBot: true, deletedAt: new Date() },
            });

            await profileRepo.update(backendBotId, {
                userId: backendBotId,
                categories: [PostCategory.BACKEND, PostCategory.AI],
            });
            await profileRepo.update(mobileBotId, {
                userId: mobileBotId,
                categories: [PostCategory.MOBILE],
            });
            await profileRepo.update(deletedBotId, {
                userId: deletedBotId,
                categories: [PostCategory.BACKEND],
            });
        });

        it("should never return non-bot accounts", async () => {
            const results = await profileRepo.findBotProfiles(undefined, 50, 0);

            const ids = results.map((p) => p.userId);
            expect(ids).not.toContain(testUserId);
            expect(ids).toEqual(expect.arrayContaining([backendBotId]));
        });

        it("should exclude soft-deleted bots", async () => {
            const results = await profileRepo.findBotProfiles(undefined, 50, 0);

            expect(results.map((p) => p.userId)).not.toContain(deletedBotId);
        });

        it("should match bots carrying at least one requested category", async () => {
            const results = await profileRepo.findBotProfiles(
                [PostCategory.AI, PostCategory.MOBILE],
                50,
                0,
            );

            const ids = results.map((p) => p.userId);
            expect(ids).toEqual(
                expect.arrayContaining([backendBotId, mobileBotId]),
            );
        });

        it("should filter out bots without the requested category", async () => {
            const results = await profileRepo.findBotProfiles(
                [PostCategory.MOBILE],
                50,
                0,
            );

            const ids = results.map((p) => p.userId);
            expect(ids).toContain(mobileBotId);
            expect(ids).not.toContain(backendBotId);
        });

        it("should return the stored categories on the entity", async () => {
            const [profile] = await profileRepo.findBotProfiles(
                [PostCategory.MOBILE],
                50,
                0,
            );

            expect(profile.categories).toEqual([PostCategory.MOBILE]);
        });

        it("should honour limit and offset", async () => {
            const page = await profileRepo.findBotProfiles(undefined, 1, 0);
            const nextPage = await profileRepo.findBotProfiles(undefined, 1, 1);

            expect(page).toHaveLength(1);
            expect(nextPage.length).toBeLessThanOrEqual(1);
            if (nextPage.length === 1) {
                expect(nextPage[0].userId).not.toBe(page[0].userId);
            }
        });
    });
});
