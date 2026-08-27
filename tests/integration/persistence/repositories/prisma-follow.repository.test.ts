import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "../../../../src/generated/prisma/client";
import { PrismaFollowUserRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-follow.repository";
import { PrismaUserRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-user.repository";
import { createPrismaClient } from "../../helpers/setup";

describe("PrismaFollowUserRepository (integration)", () => {
    let prisma: PrismaClient;
    let followRepo: PrismaFollowUserRepository;
    let userAId: string;
    let userBId: string;
    let userCId: string;

    beforeAll(async () => {
        prisma = createPrismaClient();
        followRepo = new PrismaFollowUserRepository(prisma);

        const userRepo = new PrismaUserRepository(prisma, {
            gracePeriodDays: 30,
        });
        const [userA, userB, userC] = await Promise.all([
            userRepo.create({
                email: "follow_a@follow-repo-test.com",
                username: "follow_a_followrepo",
                passwordHash: "hashed",
            }),
            userRepo.create({
                email: "follow_b@follow-repo-test.com",
                username: "follow_b_followrepo",
                passwordHash: "hashed",
            }),
            userRepo.create({
                email: "follow_c@follow-repo-test.com",
                username: "follow_c_followrepo",
                passwordHash: "hashed",
            }),
        ]);
        userAId = userA.id;
        userBId = userB.id;
        userCId = userC.id;
    });

    afterAll(async () => {
        await prisma.follow.deleteMany({
            where: {
                OR: [
                    { followerId: userAId },
                    { followingId: userAId },
                    { followerId: userBId },
                    { followingId: userBId },
                    { followerId: userCId },
                    { followingId: userCId },
                ],
            },
        });
        await prisma.user.deleteMany({
            where: { email: { contains: "@follow-repo-test.com" } },
        });
        await prisma.$disconnect();
    });

    describe("followUser() / checkIsFollowing()", () => {
        it("should create a follow relationship", async () => {
            await followRepo.followUser(userAId, userBId);

            const isFollowing = await followRepo.checkIsFollowing(
                userAId,
                userBId,
            );
            expect(isFollowing).toBe(true);
        });

        it("should return false when not following", async () => {
            const isFollowing = await followRepo.checkIsFollowing(
                userBId,
                userAId,
            );
            expect(isFollowing).toBe(false);
        });

        it("should report whether the relationship was actually created", async () => {
            const first = await followRepo.followUser(userCId, userAId);
            const second = await followRepo.followUser(userCId, userAId);

            expect(first).toBe(true);
            expect(second).toBe(false);

            await followRepo.unfollowUser(userCId, userAId);
        });

        it("should survive two concurrent follows of the same target", async () => {
            // Both calls read and write in the same window. Reading first and
            // inserting afterwards raised P2002 on the composite primary key
            // for whichever one lost, which surfaced as a 500.
            const results = await Promise.all([
                followRepo.followUser(userCId, userBId),
                followRepo.followUser(userCId, userBId),
            ]);

            expect(results.filter(Boolean)).toHaveLength(1);
            expect(
                await prisma.follow.count({
                    where: { followerId: userCId, followingId: userBId },
                }),
            ).toBe(1);

            await followRepo.unfollowUser(userCId, userBId);
        });
    });

    describe("unfollowUser()", () => {
        it("should remove the follow relationship", async () => {
            await followRepo.followUser(userBId, userCId);
            const removed = await followRepo.unfollowUser(userBId, userCId);

            expect(removed).toBe(true);

            const isFollowing = await followRepo.checkIsFollowing(
                userBId,
                userCId,
            );
            expect(isFollowing).toBe(false);
        });

        it("should report no match rather than failing on a missing row", async () => {
            const removed = await followRepo.unfollowUser(userBId, userCId);

            expect(removed).toBe(false);
        });

        it("should survive two concurrent unfollows of the same target", async () => {
            await followRepo.followUser(userBId, userCId);

            const results = await Promise.all([
                followRepo.unfollowUser(userBId, userCId),
                followRepo.unfollowUser(userBId, userCId),
            ]);

            expect(results.filter(Boolean)).toHaveLength(1);
        });
    });

    describe("checkIsFollowingBulk()", () => {
        beforeAll(async () => {
            // A already follows B; make A also follow C
            await followRepo.followUser(userAId, userCId);
        });

        it("should return ids that the follower is following", async () => {
            const followingIds = await followRepo.checkIsFollowingBulk(
                userAId,
                [userBId, userCId],
            );

            expect(followingIds).toContain(userBId);
            expect(followingIds).toContain(userCId);
        });

        it("should return empty array when following nobody in the list", async () => {
            const followingIds = await followRepo.checkIsFollowingBulk(
                userBId,
                [userCId],
            );

            expect(followingIds).toHaveLength(0);
        });

        it("should return empty array for empty followingIds input", async () => {
            const followingIds = await followRepo.checkIsFollowingBulk(
                userAId,
                [],
            );
            expect(followingIds).toHaveLength(0);
        });
    });
});
