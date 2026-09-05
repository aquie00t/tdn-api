import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "../../../../src/generated/prisma/client";
import { PrismaBlockRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-block.repository";
import { PrismaUserRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-user.repository";
import { createPrismaClient } from "../../helpers/setup";

describe("PrismaBlockRepository (integration)", () => {
    let prisma: PrismaClient;
    let blockRepo: PrismaBlockRepository;
    let userAId: string;
    let userBId: string;
    let userCId: string;

    beforeAll(async () => {
        prisma = createPrismaClient();
        blockRepo = new PrismaBlockRepository(prisma);

        const userRepo = new PrismaUserRepository(prisma, {
            gracePeriodDays: 30,
        });
        const [userA, userB, userC] = await Promise.all([
            userRepo.create({
                email: "block_a@block-repo-test.com",
                username: "block_a_blockrepo",
                passwordHash: "hashed",
            }),
            userRepo.create({
                email: "block_b@block-repo-test.com",
                username: "block_b_blockrepo",
                passwordHash: "hashed",
            }),
            userRepo.create({
                email: "block_c@block-repo-test.com",
                username: "block_c_blockrepo",
                passwordHash: "hashed",
            }),
        ]);
        userAId = userA.id;
        userBId = userB.id;
        userCId = userC.id;
    });

    beforeEach(async () => {
        await prisma.block.deleteMany({
            where: {
                OR: [
                    { blockerId: { in: [userAId, userBId, userCId] } },
                    { blockedId: { in: [userAId, userBId, userCId] } },
                ],
            },
        });
    });

    afterAll(async () => {
        await prisma.block.deleteMany({
            where: {
                OR: [
                    { blockerId: { in: [userAId, userBId, userCId] } },
                    { blockedId: { in: [userAId, userBId, userCId] } },
                ],
            },
        });
        await prisma.user.deleteMany({
            where: { email: { contains: "@block-repo-test.com" } },
        });
        await prisma.$disconnect();
    });

    describe("block() / unblock()", () => {
        it("should create the block and report that it did", async () => {
            const created = await blockRepo.block(userAId, userBId);

            expect(created).toBe(true);
            expect(await blockRepo.existsBetween(userAId, userBId)).toBe(true);
        });

        it("should be idempotent rather than raising on the primary key", async () => {
            await blockRepo.block(userAId, userBId);

            // ON CONFLICT DO NOTHING, so a double tap settles in the database
            // instead of surfacing as a 500.
            await expect(blockRepo.block(userAId, userBId)).resolves.toBe(
                false,
            );
        });

        it("should remove the block and report that it did", async () => {
            await blockRepo.block(userAId, userBId);

            expect(await blockRepo.unblock(userAId, userBId)).toBe(true);
            expect(await blockRepo.existsBetween(userAId, userBId)).toBe(false);
        });

        it("should return false when there was nothing to remove", async () => {
            expect(await blockRepo.unblock(userAId, userBId)).toBe(false);
        });

        it("should leave the other direction standing", async () => {
            await blockRepo.block(userAId, userBId);
            await blockRepo.block(userBId, userAId);

            await blockRepo.unblock(userAId, userBId);

            // Two independent decisions: lifting one is not lifting the other.
            expect(await blockRepo.existsBetween(userAId, userBId)).toBe(true);
        });
    });

    describe("existsBetween()", () => {
        it("should answer true regardless of which side wrote the row", async () => {
            await blockRepo.block(userBId, userAId);

            expect(await blockRepo.existsBetween(userAId, userBId)).toBe(true);
            expect(await blockRepo.existsBetween(userBId, userAId)).toBe(true);
        });

        it("should answer false for an unrelated pair", async () => {
            await blockRepo.block(userAId, userBId);

            expect(await blockRepo.existsBetween(userAId, userCId)).toBe(false);
        });
    });

    describe("findPairState()", () => {
        it("should report the direction the block runs", async () => {
            await blockRepo.block(userAId, userBId);

            expect(await blockRepo.findPairState(userAId, userBId)).toEqual({
                isBlocked: true,
                isBlockedBy: false,
            });
            expect(await blockRepo.findPairState(userBId, userAId)).toEqual({
                isBlocked: false,
                isBlockedBy: true,
            });
        });

        it("should report both directions when both blocked", async () => {
            await blockRepo.block(userAId, userBId);
            await blockRepo.block(userBId, userAId);

            expect(await blockRepo.findPairState(userAId, userBId)).toEqual({
                isBlocked: true,
                isBlockedBy: true,
            });
        });
    });

    describe("getInvisibleUserIds()", () => {
        it("should union both directions", async () => {
            await blockRepo.block(userAId, userBId);
            await blockRepo.block(userCId, userAId);

            const ids = await blockRepo.getInvisibleUserIds(userAId);

            expect(ids.sort()).toEqual([userBId, userCId].sort());
        });

        it("should name a mutually blocked user once", async () => {
            await blockRepo.block(userAId, userBId);
            await blockRepo.block(userBId, userAId);

            // Two rows, one person: handing the same id to a `notIn` twice is
            // wasted work, so the pair is collapsed.
            expect(await blockRepo.getInvisibleUserIds(userAId)).toEqual([
                userBId,
            ]);
        });

        it("should be empty for a user with no blocks", async () => {
            expect(await blockRepo.getInvisibleUserIds(userAId)).toEqual([]);
        });
    });

    describe("listBlocked() / countBlocked()", () => {
        it("should list only the blocks this user wrote", async () => {
            await blockRepo.block(userAId, userBId);
            await blockRepo.block(userCId, userAId);

            const listed = await blockRepo.listBlocked(userAId, 20, 0);

            expect(listed.map((row) => row.userId)).toEqual([userBId]);
            expect(await blockRepo.countBlocked(userAId)).toBe(1);
        });

        it("should return the newest block first", async () => {
            await blockRepo.block(userAId, userBId);
            await blockRepo.block(userAId, userCId);

            const listed = await blockRepo.listBlocked(userAId, 20, 0);

            expect(listed[0].userId).toBe(userCId);
        });

        it("should carry the profile fields the list renders", async () => {
            await blockRepo.block(userAId, userBId);

            const [row] = await blockRepo.listBlocked(userAId, 20, 0);

            expect(row.username).toBe("block_b_blockrepo");
            expect(row).toHaveProperty("fullName");
            expect(row).toHaveProperty("avatarUrl");
            expect(row).toHaveProperty("bio");
        });

        it("should page", async () => {
            await blockRepo.block(userAId, userBId);
            await blockRepo.block(userAId, userCId);

            const page = await blockRepo.listBlocked(userAId, 1, 1);

            expect(page).toHaveLength(1);
            expect(page[0].userId).toBe(userBId);
        });
    });

    describe("cascade", () => {
        it("should drop the blocks a deleted user was part of", async () => {
            const userRepo = new PrismaUserRepository(prisma, {
                gracePeriodDays: 30,
            });
            const doomed = await userRepo.create({
                email: "block_d@block-repo-test.com",
                username: "block_d_blockrepo",
                passwordHash: "hashed",
            });

            await blockRepo.block(userAId, doomed.id);
            await prisma.user.delete({ where: { id: doomed.id } });

            // Both sides cascade, so the purge job cannot leave a block
            // pointing at an account that no longer exists.
            expect(await blockRepo.countBlocked(userAId)).toBe(0);
        });
    });
});
