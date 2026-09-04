import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "../../../../src/generated/prisma/client";
import { PrismaDigestDeliveryRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-digest-delivery.repository";
import { PrismaUserRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-user.repository";
import { createPrismaClient } from "../../helpers/setup";

const DAY = new Date("2026-09-06T00:00:00.000Z");
const NEXT_DAY = new Date("2026-09-07T00:00:00.000Z");

describe("PrismaDigestDeliveryRepository (integration)", () => {
    let prisma: PrismaClient;
    let repo: PrismaDigestDeliveryRepository;
    let userRepo: PrismaUserRepository;

    beforeAll(async () => {
        prisma = createPrismaClient();
        repo = new PrismaDigestDeliveryRepository(prisma);
        userRepo = new PrismaUserRepository(prisma, { gracePeriodDays: 30 });
    });

    afterAll(async () => {
        await prisma.user.deleteMany({
            where: { email: { contains: "@digest-repo-test.com" } },
        });
        await prisma.$disconnect();
    });

    /** Creates a user this suite can claim digests for. */
    async function makeUser(name: string): Promise<string> {
        const user = await userRepo.create({
            email: `${name}@digest-repo-test.com`,
            username: `${name}_digestrepo`,
            passwordHash: "hashed",
        });

        return user.id;
    }

    describe("claim()", () => {
        it("should let the first caller through", async () => {
            const userId = await makeUser("first");

            expect(await repo.claim(userId, DAY)).toBe(true);
        });

        it("should turn the second caller away for the same day", async () => {
            // This is the whole multi-instance guard: the loser of the race
            // must skip the user rather than send a second copy.
            const userId = await makeUser("second");

            expect(await repo.claim(userId, DAY)).toBe(true);
            expect(await repo.claim(userId, DAY)).toBe(false);
        });

        it("should let the same user through again the next day", async () => {
            const userId = await makeUser("nextday");

            expect(await repo.claim(userId, DAY)).toBe(true);
            expect(await repo.claim(userId, NEXT_DAY)).toBe(true);
        });

        it("should not let one user's claim block another's", async () => {
            const one = await makeUser("onea");
            const two = await makeUser("twob");

            expect(await repo.claim(one, DAY)).toBe(true);
            expect(await repo.claim(two, DAY)).toBe(true);
        });
    });

    describe("findLastSentAt()", () => {
        it("should return null for a user who never received one", async () => {
            const userId = await makeUser("never");

            expect(await repo.findLastSentAt(userId)).toBeNull();
        });

        it("should return the most recent delivery", async () => {
            const userId = await makeUser("recent");

            await repo.claim(userId, DAY);
            await repo.claim(userId, NEXT_DAY);

            const lastSentAt = await repo.findLastSentAt(userId);

            expect(lastSentAt).toBeInstanceOf(Date);

            const rows = await prisma.digestDelivery.findMany({
                where: { userId },
                orderBy: { createdAt: "desc" },
            });
            expect(rows).toHaveLength(2);
            expect(lastSentAt).toStrictEqual(rows[0].createdAt);
        });
    });
});
