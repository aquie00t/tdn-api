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

        it("should persist the resolved mentions and read them back", async () => {
            const userRepo = new PrismaUserRepository(prisma, {
                gracePeriodDays: 30,
            });
            const mentioned = await userRepo.create({
                email: "mentioned@post-repo-test.com",
                username: "mentioned_postrepo",
                passwordHash: "hashed",
            });

            const post = Post.create(
                "hey @mentioned_postrepo",
                PostType.COMMUNITY,
                testUserId,
                [],
                [],
                undefined,
                null,
                false,
                undefined,
                [{ id: mentioned.id, username: mentioned.username }],
            );

            const created = await postRepo.create(post);

            expect(created.mentions).toEqual([
                { id: mentioned.id, username: "mentioned_postrepo" },
            ]);

            const reloaded = await postRepo.findById(created.id);
            expect(reloaded!.mentions).toEqual([
                { id: mentioned.id, username: "mentioned_postrepo" },
            ]);
        });

        it("should store a post that mentions nobody with an empty list", async () => {
            const created = await postRepo.create(
                Post.create(
                    "a post naming nobody",
                    PostType.COMMUNITY,
                    testUserId,
                ),
            );

            expect(created.mentions).toEqual([]);
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

        it("should list only the quotes of the requested post, newest first", async () => {
            const original = await postRepo.create(
                Post.create("Listed original", PostType.COMMUNITY, testUserId),
            );
            const other = await postRepo.create(
                Post.create("Unrelated post", PostType.COMMUNITY, testUserId),
            );

            const first = await postRepo.create(
                Post.create(
                    "First quote",
                    PostType.COMMUNITY,
                    testUserId,
                    [],
                    [],
                    original.id,
                ),
            );
            const second = await postRepo.create(
                Post.create(
                    "Second quote",
                    PostType.COMMUNITY,
                    testUserId,
                    [],
                    [],
                    original.id,
                ),
            );
            await postRepo.create(
                Post.create(
                    "Quote of something else",
                    PostType.COMMUNITY,
                    testUserId,
                    [],
                    [],
                    other.id,
                ),
            );

            const result = await postRepo.findAll({
                page: 1,
                limit: 10,
                quotedPostId: original.id,
            });

            expect(result.total).toBe(2);
            expect(result.posts.map((p) => p.id)).toEqual([
                second.id,
                first.id,
            ]);
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
    describe("feed ranking reads", () => {
        it("should persist and read back the detected language", async () => {
            const created = await postRepo.create(
                Post.create(
                    "Dil etiketi kalici olmali",
                    PostType.COMMUNITY,
                    testUserId,
                    [],
                    [],
                    undefined,
                    "tr",
                ),
            );

            const read = await postRepo.findById(created.id);

            expect(read?.lang).toBe("tr");
        });

        it("should leave an undetected language null rather than defaulting it", async () => {
            const created = await postRepo.create(
                Post.create(
                    "https://example.com",
                    PostType.COMMUNITY,
                    testUserId,
                ),
            );

            expect((await postRepo.findById(created.id))?.lang).toBeNull();
        });

        describe("findFeedCandidates()", () => {
            it("should return the ranking inputs for posts inside the window", async () => {
                const created = await postRepo.create(
                    Post.create(
                        "A candidate for the feed",
                        PostType.COMMUNITY,
                        testUserId,
                        [],
                        [],
                        undefined,
                        "en",
                    ),
                );

                const candidates = await postRepo.findFeedCandidates({
                    since: new Date(Date.now() - 60 * 60 * 1000),
                    limit: 100,
                });

                const found = candidates.find((c) => c.id === created.id);
                expect(found).toBeDefined();
                expect(found).toMatchObject({
                    authorId: testUserId,
                    lang: "en",
                    likeCount: 0,
                    commentCount: 0,
                    quoteCount: 0,
                });
                expect(found?.createdAt).toBeInstanceOf(Date);
            });

            it("should exclude posts older than the window", async () => {
                const created = await postRepo.create(
                    Post.create(
                        "Too old for the pool",
                        PostType.COMMUNITY,
                        testUserId,
                    ),
                );
                await prisma.post.update({
                    where: { id: created.id },
                    data: {
                        createdAt: new Date(
                            Date.now() - 30 * 24 * 60 * 60 * 1000,
                        ),
                    },
                });

                const candidates = await postRepo.findFeedCandidates({
                    since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    limit: 100,
                });

                expect(candidates.map((c) => c.id)).not.toContain(created.id);
            });

            it("should keep the newest posts when the pool overflows", async () => {
                const candidates = await postRepo.findFeedCandidates({
                    since: new Date(0),
                    limit: 2,
                });

                expect(candidates).toHaveLength(2);
                expect(
                    candidates[0].createdAt.getTime(),
                ).toBeGreaterThanOrEqual(candidates[1].createdAt.getTime());
            });
        });

        describe("findByIds()", () => {
            it("should hydrate the posts asked for, author and all", async () => {
                const first = await postRepo.create(
                    Post.create("Hydrate me", PostType.COMMUNITY, testUserId),
                );
                const second = await postRepo.create(
                    Post.create("And me", PostType.COMMUNITY, testUserId),
                );

                const posts = await postRepo.findByIds([second.id, first.id]);

                expect(posts.map((p) => p.id).sort()).toEqual(
                    [first.id, second.id].sort(),
                );
                expect(posts[0].author.username).toBeDefined();
            });

            it("should skip an id that no longer exists", async () => {
                const created = await postRepo.create(
                    Post.create("Still here", PostType.COMMUNITY, testUserId),
                );

                const posts = await postRepo.findByIds([
                    created.id,
                    "00000000-0000-0000-0000-000000000000",
                ]);

                expect(posts.map((p) => p.id)).toEqual([created.id]);
            });

            it("should return nothing for an empty id list without querying", async () => {
                expect(await postRepo.findByIds([])).toEqual([]);
            });
        });

        describe("countAll()", () => {
            it("should count the same rows findAll pages over", async () => {
                const filters = { type: PostType.COMMUNITY };

                const counted = await postRepo.countAll(filters);
                const { total } = await postRepo.findAll({
                    page: 1,
                    limit: 1,
                    ...filters,
                });

                expect(counted).toBe(total);
            });
        });

        describe("findAll() with an explicit skip", () => {
            it("should offset by skip rather than by page", async () => {
                const byPage = await postRepo.findAll({ page: 2, limit: 3 });
                const bySkip = await postRepo.findAll({
                    page: 1,
                    limit: 3,
                    skip: 3,
                });

                expect(bySkip.posts.map((p) => p.id)).toEqual(
                    byPage.posts.map((p) => p.id),
                );
            });

            it("should leave out the excluded ids", async () => {
                const { posts } = await postRepo.findAll({
                    page: 1,
                    limit: 5,
                });
                const excluded = posts[0].id;

                const { posts: filtered } = await postRepo.findAll({
                    page: 1,
                    limit: 5,
                    excludeIds: [excluded],
                });

                expect(filtered.map((p) => p.id)).not.toContain(excluded);
            });
        });
    });
});
