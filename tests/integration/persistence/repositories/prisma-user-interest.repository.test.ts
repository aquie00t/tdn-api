import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "../../../../src/generated/prisma/client";
import { PrismaUserInterestRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-user-interest.repository";
import { PrismaPostRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-post.repository";
import { PrismaUserRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-user.repository";
import { Post } from "../../../../src/core/domain/entities/post.entity";
import { PostType } from "../../../../src/core/domain/enums/post-type.enum";
import { PostCategory } from "../../../../src/core/domain/enums/post-category-enum";
import {
    InteractionType,
    InterestKind,
} from "../../../../src/core/domain/interfaces/user-interest.interface";
import { createPrismaClient } from "../../helpers/setup";

const EMAIL_DOMAIN = "@interest-repo-test.com";

describe("PrismaUserInterestRepository (integration)", () => {
    let prisma: PrismaClient;
    let repo: PrismaUserInterestRepository;
    let postRepo: PrismaPostRepository;
    let readerId: string;
    let authorId: string;
    let postId: string;

    beforeAll(async () => {
        prisma = createPrismaClient();
        repo = new PrismaUserInterestRepository(prisma);
        postRepo = new PrismaPostRepository(prisma);

        const userRepo = new PrismaUserRepository(prisma, {
            gracePeriodDays: 30,
        });

        const reader = await userRepo.create({
            email: `reader${EMAIL_DOMAIN}`,
            username: "reader_interestrepo",
            passwordHash: "hashed",
        });
        readerId = reader.id;

        const author = await userRepo.create({
            email: `author${EMAIL_DOMAIN}`,
            username: "author_interestrepo",
            passwordHash: "hashed",
        });
        authorId = author.id;

        const post = await postRepo.create(
            Post.create(
                "A post about #rust and memory safety",
                PostType.COMMUNITY,
                authorId,
                [],
                [PostCategory.BACKEND],
            ),
        );
        postId = post.id;
    });

    afterAll(async () => {
        await prisma.post.deleteMany({
            where: { authorId: { in: [readerId, authorId] } },
        });
        await prisma.user.deleteMany({
            where: { email: { contains: EMAIL_DOMAIN } },
        });
        await prisma.$disconnect();
    });

    describe("replaceForUser() and findByUserId()", () => {
        it("should store and read back a profile", async () => {
            await repo.replaceForUser(readerId, [
                { kind: InterestKind.TAG, key: "rust", weight: 1 },
                { kind: InterestKind.CATEGORY, key: "backend", weight: 0.5 },
            ]);

            const profile = await repo.findByUserId(readerId);

            expect(profile).toHaveLength(2);
            expect(profile).toEqual(
                expect.arrayContaining([
                    { kind: InterestKind.TAG, key: "rust", weight: 1 },
                    {
                        kind: InterestKind.CATEGORY,
                        key: "backend",
                        weight: 0.5,
                    },
                ]),
            );
        });

        it("should replace rather than merge", async () => {
            // An interest that has decayed out of the new set has to actually
            // disappear; upserting would keep it forever.
            await repo.replaceForUser(readerId, [
                { kind: InterestKind.TAG, key: "kubernetes", weight: 1 },
            ]);
            await repo.replaceForUser(readerId, [
                { kind: InterestKind.TAG, key: "rust", weight: 1 },
            ]);

            const profile = await repo.findByUserId(readerId);

            expect(profile.map((i) => i.key)).toEqual(["rust"]);
        });

        it("should clear a profile when handed nothing", async () => {
            await repo.replaceForUser(readerId, [
                { kind: InterestKind.TAG, key: "rust", weight: 1 },
            ]);

            await repo.replaceForUser(readerId, []);

            expect(await repo.findByUserId(readerId)).toEqual([]);
        });

        it("should keep a tag and a category of the same name apart", async () => {
            // They share a key and differ only by kind, which is exactly what
            // the composite primary key has to allow.
            await repo.replaceForUser(readerId, [
                { kind: InterestKind.TAG, key: "ai", weight: 1 },
                { kind: InterestKind.CATEGORY, key: "ai", weight: 0.5 },
            ]);

            expect(await repo.findByUserId(readerId)).toHaveLength(2);
        });

        it("should return nothing for a user with no profile", async () => {
            // authorId is only ever written to as a post author, never as the
            // subject of a profile rebuild.
            expect(await repo.findByUserId(authorId)).toEqual([]);
        });
    });

    describe("findInteractionSignals()", () => {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        it("should carry the post's tags and categories onto a like", async () => {
            await prisma.postLike.create({
                data: { postId, userId: readerId },
            });

            const signals = await repo.findInteractionSignals(
                readerId,
                since,
                100,
            );

            const like = signals.find(
                (signal) => signal.type === InteractionType.LIKED,
            );
            expect(like?.tags).toContain("rust");
            expect(like?.categories).toContain(PostCategory.BACKEND);
            expect(like?.occurredAt).toBeInstanceOf(Date);
        });

        it("should read a user's own posts as the strongest kind of signal", async () => {
            await postRepo.create(
                Post.create(
                    "My own post about #zig",
                    PostType.COMMUNITY,
                    readerId,
                ),
            );

            const signals = await repo.findInteractionSignals(
                readerId,
                since,
                100,
            );

            const authored = signals.find(
                (signal) => signal.type === InteractionType.AUTHORED,
            );
            expect(authored?.tags).toContain("zig");
        });

        it("should leave out interactions older than the window", async () => {
            const bookmark = await prisma.postBookmark.create({
                data: { postId, userId: readerId },
            });
            await prisma.postBookmark.update({
                where: { id: bookmark.id },
                data: {
                    createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
                },
            });

            const signals = await repo.findInteractionSignals(
                readerId,
                since,
                100,
            );

            expect(
                signals.some(
                    (signal) => signal.type === InteractionType.BOOKMARKED,
                ),
            ).toBe(false);
        });

        it("should cap how much it reads per interaction type", async () => {
            const signals = await repo.findInteractionSignals(
                readerId,
                since,
                1,
            );

            // One of each type at most, so one prolific account cannot make
            // the nightly job unbounded.
            const perType = new Map<string, number>();
            for (const signal of signals) {
                perType.set(signal.type, (perType.get(signal.type) ?? 0) + 1);
            }
            expect([...perType.values()].every((count) => count <= 1)).toBe(
                true,
            );
        });

        it("should return nothing for a user who has done nothing", async () => {
            // A genuinely inert account. `authorId` wrote the fixture post, so
            // it has an AUTHORED signal of its own.
            const inert = await new PrismaUserRepository(prisma, {
                gracePeriodDays: 30,
            }).create({
                email: `inert${EMAIL_DOMAIN}`,
                username: "inert_interestrepo",
                passwordHash: "hashed",
            });

            expect(
                await repo.findInteractionSignals(inert.id, since, 100),
            ).toEqual([]);
        });
    });

    describe("findActiveUserIds()", () => {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        it("should include a user who interacted inside the window", async () => {
            const { userIds } = await repo.findActiveUserIds(since, 100);

            expect(userIds).toContain(readerId);
        });

        it("should leave out a user who has done nothing at all", async () => {
            const dormant = await new PrismaUserRepository(prisma, {
                gracePeriodDays: 30,
            }).create({
                email: `dormant${EMAIL_DOMAIN}`,
                username: "dormant_interestrepo",
                passwordHash: "hashed",
            });

            const { userIds } = await repo.findActiveUserIds(since, 100);

            expect(userIds).not.toContain(dormant.id);
        });

        it("should page by keyset without repeating a user", async () => {
            const first = await repo.findActiveUserIds(since, 1);
            expect(first.userIds).toHaveLength(1);
            expect(first.nextCursor).toBe(first.userIds[0]);

            const second = await repo.findActiveUserIds(
                since,
                1,
                first.nextCursor!,
            );

            expect(second.userIds).not.toEqual(first.userIds);
        });

        it("should stop handing back a cursor on a short page", async () => {
            const { nextCursor } = await repo.findActiveUserIds(since, 1000);

            expect(nextCursor).toBeNull();
        });
    });

    it("should take a user's profile with them when the account is deleted", async () => {
        const userRepo = new PrismaUserRepository(prisma, {
            gracePeriodDays: 30,
        });
        const doomed = await userRepo.create({
            email: `doomed${EMAIL_DOMAIN}`,
            username: "doomed_interestrepo",
            passwordHash: "hashed",
        });
        await repo.replaceForUser(doomed.id, [
            { kind: InterestKind.TAG, key: "rust", weight: 1 },
        ]);

        await prisma.user.delete({ where: { id: doomed.id } });

        expect(
            await prisma.userInterest.count({ where: { userId: doomed.id } }),
        ).toBe(0);
    });
});
