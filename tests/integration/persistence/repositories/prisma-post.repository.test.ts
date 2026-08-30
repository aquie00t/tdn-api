import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "../../../../src/generated/prisma/client";
import { PrismaPostRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-post.repository";
import { PrismaUserRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-user.repository";
import { Post } from "../../../../src/core/domain/entities/post.entity";
import { PostType } from "../../../../src/core/domain/enums/post-type.enum";
import { createPrismaClient } from "../../helpers/setup";

describe("PrismaPostRepository (integration)", () => {
    let prisma: PrismaClient;
    let postRepo: PrismaPostRepository;
    let testUserId: string;

    beforeAll(async () => {
        prisma = createPrismaClient();
        postRepo = new PrismaPostRepository(prisma);

        const userRepo = new PrismaUserRepository(prisma, {
            gracePeriodDays: 30,
        });
        const user = await userRepo.create({
            email: "postauthor@post-repo-test.com",
            username: "postauthor_postrepo",
            passwordHash: "hashed",
        });
        testUserId = user.id;
    });

    afterAll(async () => {
        await prisma.post.deleteMany({ where: { authorId: testUserId } });
        await prisma.user.deleteMany({
            where: { email: { contains: "@post-repo-test.com" } },
        });
        await prisma.$disconnect();
    });

    describe("create()", () => {
        it("should create a post and return a domain entity", async () => {
            const post = Post.create(
                "Hello world from integration tests",
                PostType.COMMUNITY,
                testUserId,
            );

            const created = await postRepo.create(post);

            expect(created.id).toBeDefined();
            expect(created.content).toBe("Hello world from integration tests");
            expect(created.type).toBe(PostType.COMMUNITY);
            expect(created.author.id).toBe(testUserId);
        });

        it("should extract and persist hashtags from content", async () => {
            const post = Post.create(
                "A post with #nodejs and #typescript tags",
                PostType.TECH_NEWS,
                testUserId,
            );

            const created = await postRepo.create(post);

            expect(created.tags.length).toBeGreaterThanOrEqual(2);
            expect(created.tags).toContain("nodejs");
            expect(created.tags).toContain("typescript");

            const nodejsTag = await prisma.tag.findUnique({
                where: { name: "nodejs" },
            });
            expect(nodejsTag).not.toBeNull();
        });
    });

    describe("findAll()", () => {
        beforeAll(async () => {
            await postRepo.create(
                Post.create(
                    "Pagination post 1",
                    PostType.COMMUNITY,
                    testUserId,
                ),
            );
            await postRepo.create(
                Post.create(
                    "Pagination post 2",
                    PostType.COMMUNITY,
                    testUserId,
                ),
            );
            await postRepo.create(
                Post.create(
                    "Tech post for filter",
                    PostType.TECH_NEWS,
                    testUserId,
                ),
            );
        });

        it("should return paginated posts with total count", async () => {
            const result = await postRepo.findAll({
                page: 1,
                limit: 2,
                authorId: testUserId,
            });

            expect(result.posts).toHaveLength(2);
            expect(result.total).toBeGreaterThanOrEqual(2);
        });

        it("should filter posts by type", async () => {
            const result = await postRepo.findAll({
                page: 1,
                limit: 50,
                authorId: testUserId,
                type: PostType.TECH_NEWS,
            });

            expect(result.posts.length).toBeGreaterThanOrEqual(1);
            expect(
                result.posts.every((p) => p.type === PostType.TECH_NEWS),
            ).toBe(true);
        });

        it("should return second page", async () => {
            const page1 = await postRepo.findAll({
                page: 1,
                limit: 2,
                authorId: testUserId,
            });
            const page2 = await postRepo.findAll({
                page: 2,
                limit: 2,
                authorId: testUserId,
            });

            const ids1 = page1.posts.map((p) => p.id);
            const ids2 = page2.posts.map((p) => p.id);
            const overlap = ids1.filter((id) => ids2.includes(id));
            expect(overlap).toHaveLength(0);
        });
    });

    describe("findById()", () => {
        it("should find a post by id", async () => {
            const created = await postRepo.create(
                Post.create("Find by id post", PostType.COMMUNITY, testUserId),
            );

            const found = await postRepo.findById(created.id);
            expect(found).not.toBeNull();
            expect(found!.id).toBe(created.id);
        });

        it("should return null for non-existent id", async () => {
            const found = await postRepo.findById(
                "00000000-0000-0000-0000-000000000000",
            );
            expect(found).toBeNull();
        });
    });

    describe("delete()", () => {
        it("should remove the post from the database", async () => {
            const created = await postRepo.create(
                Post.create("Post to delete", PostType.COMMUNITY, testUserId),
            );

            await postRepo.delete(created.id);

            const found = await postRepo.findById(created.id);
            expect(found).toBeNull();
        });
    });

    describe("quote posts", () => {
        it("should persist the quoted post id and read the card back", async () => {
            const original = await postRepo.create(
                Post.create("The original", PostType.COMMUNITY, testUserId),
            );

            const quote = await postRepo.create(
                Post.create(
                    "Quoting the original",
                    PostType.COMMUNITY,
                    testUserId,
                    [],
                    [],
                    original.id,
                ),
            );

            expect(quote.quotedPostId).toBe(original.id);
            expect(quote.quotedPost?.id).toBe(original.id);
            expect(quote.quotedPost?.content).toBe("The original");
            expect(quote.quotedPost?.author.username).toBe(
                "postauthor_postrepo",
            );

            const readBack = await postRepo.findById(quote.id);
            expect(readBack?.quotedPost?.content).toBe("The original");
        });

        it("should include only one level of quote", async () => {
            // A quote card shows the post being quoted, never the chain behind
            // it - otherwise a long chain would drag its whole history into
            // every feed row.
            const original = await postRepo.create(
                Post.create("Level 0", PostType.COMMUNITY, testUserId),
            );
            const firstQuote = await postRepo.create(
                Post.create(
                    "Level 1",
                    PostType.COMMUNITY,
                    testUserId,
                    [],
                    [],
                    original.id,
                ),
            );
            const secondQuote = await postRepo.create(
                Post.create(
                    "Level 2",
                    PostType.COMMUNITY,
                    testUserId,
                    [],
                    [],
                    firstQuote.id,
                ),
            );

            const readBack = await postRepo.findById(secondQuote.id);

            expect(readBack?.quotedPost?.content).toBe("Level 1");
            expect(readBack?.quotedPost).not.toHaveProperty("quotedPost");
        });

        it("should leave quotedPost unset on a post that quotes nothing", async () => {
            const created = await postRepo.create(
                Post.create("No quote here", PostType.COMMUNITY, testUserId),
            );

            const readBack = await postRepo.findById(created.id);

            expect(readBack?.quotedPostId).toBeUndefined();
            expect(readBack?.quotedPost).toBeUndefined();
            expect(readBack?.isQuote()).toBe(false);
        });

        it("should move the quote counter up and down", async () => {
            const original = await postRepo.create(
                Post.create("Counted post", PostType.COMMUNITY, testUserId),
            );

            await postRepo.incrementQuoteCount(original.id);
            await postRepo.incrementQuoteCount(original.id);
            expect((await postRepo.findById(original.id))?.quoteCount).toBe(2);

            await postRepo.decrementQuoteCount(original.id);
            expect((await postRepo.findById(original.id))?.quoteCount).toBe(1);
        });

        it("should start a new post at a quote count of zero", async () => {
            const created = await postRepo.create(
                Post.create("Fresh post", PostType.COMMUNITY, testUserId),
            );

            expect(created.quoteCount).toBe(0);
        });

        it("should cascade the delete of an original onto its quotes", async () => {
            const original = await postRepo.create(
                Post.create("Doomed original", PostType.COMMUNITY, testUserId),
            );
            const quote = await postRepo.create(
                Post.create(
                    "Quoting a doomed post",
                    PostType.COMMUNITY,
                    testUserId,
                    [],
                    [],
                    original.id,
                ),
            );

            await postRepo.delete(original.id);

            expect(await postRepo.findById(quote.id)).toBeNull();
        });
    });
});
