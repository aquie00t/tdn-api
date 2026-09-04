import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "../../../../src/generated/prisma/client";
import { PrismaArticleRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-article.repository";
import { PrismaUserRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-user.repository";
import { Article } from "../../../../src/core/domain/entities/article.entity";
import { ArticleStatus } from "../../../../src/core/domain/enums/article-status.enum";
import { PostCategory } from "../../../../src/core/domain/enums/post-category-enum";
import { createPrismaClient } from "../../helpers/setup";

const EMAIL_DOMAIN = "@article-repo-test.com";

describe("PrismaArticleRepository (integration)", () => {
    let prisma: PrismaClient;
    let articleRepo: PrismaArticleRepository;
    let authorId: string;
    let otherUserId: string;
    let suffix = 0;

    /**
     * Each article needs a unique slug; a counter keeps them collision-free
     * without depending on randomness inside the test.
     */
    const nextSuffix = (): string => (++suffix).toString(16).padStart(8, "0");

    const makeArticle = (
        overrides: {
            title?: string;
            body?: string;
            tags?: string[];
            categories?: PostCategory[];
            authorId?: string;
        } = {},
    ): Article =>
        Article.create({
            title: overrides.title ?? "Integration article",
            body: overrides.body ?? "Some markdown body for the repository.",
            authorId: overrides.authorId ?? authorId,
            slugSuffix: nextSuffix(),
            tags: overrides.tags,
            categories: overrides.categories,
        });

    beforeAll(async () => {
        prisma = createPrismaClient();
        articleRepo = new PrismaArticleRepository(prisma);

        const userRepo = new PrismaUserRepository(prisma, {
            gracePeriodDays: 30,
        });

        const author = await userRepo.create({
            email: `articleauthor${EMAIL_DOMAIN}`,
            username: "articleauthor_repo",
            passwordHash: "hashed",
        });
        authorId = author.id;

        const other = await userRepo.create({
            email: `articlereader${EMAIL_DOMAIN}`,
            username: "articlereader_repo",
            passwordHash: "hashed",
        });
        otherUserId = other.id;
    });

    afterAll(async () => {
        await prisma.article.deleteMany({
            where: { authorId: { in: [authorId, otherUserId] } },
        });
        await prisma.user.deleteMany({
            where: { email: { contains: EMAIL_DOMAIN } },
        });
        await prisma.$disconnect();
    });

    describe("create()", () => {
        it("should persist an article and return a domain entity", async () => {
            const created = await articleRepo.create(
                makeArticle({ title: "Hello from integration" }),
            );

            expect(created.id).toBeDefined();
            expect(created.title).toBe("Hello from integration");
            expect(created.status).toBe(ArticleStatus.DRAFT);
            expect(created.author.id).toBe(authorId);
            expect(created.readingTimeMinutes).toBeGreaterThanOrEqual(1);
        });

        it("should attach tags with connectOrCreate and reuse existing rows", async () => {
            const first = await articleRepo.create(
                makeArticle({ tags: ["fastify", "prisma"] }),
            );
            const second = await articleRepo.create(
                makeArticle({ tags: ["prisma", "postgres"] }),
            );

            expect(first.tags.sort()).toEqual(["fastify", "prisma"]);
            expect(second.tags.sort()).toEqual(["postgres", "prisma"]);

            const prismaTagRows = await prisma.tag.findMany({
                where: { name: "prisma" },
            });
            expect(prismaTagRows).toHaveLength(1);
        });

        it("should reject a duplicate slug", async () => {
            const article = makeArticle({ title: "Unique slug please" });
            await articleRepo.create(article);

            await expect(articleRepo.create(article)).rejects.toThrow();
        });

        it("should store the markdown body unchanged", async () => {
            const body = '# Title\n\n<script>alert("x")</script>\n\n- item';
            const created = await articleRepo.create(makeArticle({ body }));

            const reloaded = await articleRepo.findById(created.id);

            expect(reloaded?.body).toBe(body);
        });
    });

    describe("findAll()", () => {
        it("should exclude drafts and archived articles", async () => {
            const draft = await articleRepo.create(
                makeArticle({ title: "A draft article" }),
            );

            const publishable = await articleRepo.create(
                makeArticle({ title: "A published article" }),
            );
            publishable.publish();
            await articleRepo.update(publishable);

            const archivable = await articleRepo.create(
                makeArticle({ title: "An archived article" }),
            );
            archivable.publish();
            archivable.archive();
            await articleRepo.update(archivable);

            const { articles } = await articleRepo.findAll({
                page: 1,
                limit: 50,
                authorId,
            });

            const ids = articles.map((article) => article.id);
            expect(ids).toContain(publishable.id);
            expect(ids).not.toContain(draft.id);
            expect(ids).not.toContain(archivable.id);
            expect(
                articles.every(
                    (article) => article.status === ArticleStatus.PUBLISHED,
                ),
            ).toBe(true);
        });

        it("should filter by tag", async () => {
            const tagged = await articleRepo.create(
                makeArticle({ title: "Tagged one", tags: ["integration-tag"] }),
            );
            tagged.publish();
            await articleRepo.update(tagged);

            const { articles, total } = await articleRepo.findAll({
                page: 1,
                limit: 20,
                tag: "integration-tag",
            });

            expect(total).toBeGreaterThanOrEqual(1);
            expect(articles.map((a) => a.id)).toContain(tagged.id);
        });

        it("should filter by category", async () => {
            const categorized = await articleRepo.create(
                makeArticle({
                    title: "Backend piece",
                    categories: [PostCategory.BACKEND],
                }),
            );
            categorized.publish();
            await articleRepo.update(categorized);

            const { articles } = await articleRepo.findAll({
                page: 1,
                limit: 20,
                categories: [PostCategory.BACKEND],
            });

            expect(articles.map((a) => a.id)).toContain(categorized.id);
        });

        it("should paginate and report the total", async () => {
            const { articles, total } = await articleRepo.findAll({
                page: 1,
                limit: 1,
                authorId,
            });

            expect(articles).toHaveLength(1);
            expect(total).toBeGreaterThan(1);
        });

        it("should resolve viewer flags against the requesting user only", async () => {
            const article = await articleRepo.create(
                makeArticle({ title: "Liked by one user" }),
            );
            article.publish();
            await articleRepo.update(article);

            await prisma.articleLike.create({
                data: { articleId: article.id, userId: otherUserId },
            });

            const asLiker = await articleRepo.findById(article.id, otherUserId);
            const asAuthor = await articleRepo.findById(article.id, authorId);
            const asGuest = await articleRepo.findById(article.id);

            expect(asLiker?.isLiked).toBe(true);
            expect(asAuthor?.isLiked).toBe(false);
            expect(asGuest?.isLiked).toBe(false);
        });
    });

    describe("findByAuthorId()", () => {
        it("should include drafts for the author", async () => {
            const draft = await articleRepo.create(
                makeArticle({ title: "Author visible draft" }),
            );

            const { articles } = await articleRepo.findByAuthorId({
                authorId,
                page: 1,
                limit: 50,
            });

            expect(articles.map((a) => a.id)).toContain(draft.id);
        });

        it("should honour a status filter", async () => {
            const { articles } = await articleRepo.findByAuthorId({
                authorId,
                page: 1,
                limit: 50,
                status: ArticleStatus.DRAFT,
            });

            expect(articles.length).toBeGreaterThan(0);
            expect(
                articles.every(
                    (article) => article.status === ArticleStatus.DRAFT,
                ),
            ).toBe(true);
        });

        it("should not return another author's articles", async () => {
            const { articles } = await articleRepo.findByAuthorId({
                authorId: otherUserId,
                page: 1,
                limit: 50,
            });

            expect(articles).toHaveLength(0);
        });
    });

    describe("findBySlug()", () => {
        it("should return a draft so its author can read it back", async () => {
            const draft = await articleRepo.create(
                makeArticle({ title: "Slug lookup draft" }),
            );

            const found = await articleRepo.findBySlug(draft.slug);

            expect(found?.id).toBe(draft.id);
            expect(found?.status).toBe(ArticleStatus.DRAFT);
        });

        it("should return null for an unknown slug", async () => {
            expect(await articleRepo.findBySlug("no-such-slug-00000000")).toBe(
                null,
            );
        });
    });

    describe("update()", () => {
        it("should persist an edit without changing the slug", async () => {
            const article = await articleRepo.create(
                makeArticle({ title: "Before edit" }),
            );
            const originalSlug = article.slug;

            article.applyEdit({
                title: "After edit",
                body: Array(600).fill("word").join(" "),
            });
            const updated = await articleRepo.update(article);

            expect(updated.slug).toBe(originalSlug);
            expect(updated.title).toBe("After edit");
            expect(updated.readingTimeMinutes).toBe(3);
        });

        it("should replace the tag set rather than accumulate it", async () => {
            const article = await articleRepo.create(
                makeArticle({ tags: ["one", "two"] }),
            );

            article.applyEdit({ tags: ["three"] });
            const updated = await articleRepo.update(article);

            expect(updated.tags).toEqual(["three"]);
        });

        it("should stamp publishedAt when publishing", async () => {
            const article = await articleRepo.create(
                makeArticle({ title: "To be published" }),
            );

            article.publish();
            const updated = await articleRepo.update(article);

            expect(updated.status).toBe(ArticleStatus.PUBLISHED);
            expect(updated.publishedAt).toBeInstanceOf(Date);
        });
    });

    describe("countPublishedByAuthorId()", () => {
        it("should count only published articles", async () => {
            const { articles } = await articleRepo.findAll({
                page: 1,
                limit: 100,
                authorId,
            });

            const count = await articleRepo.countPublishedByAuthorId(authorId);

            expect(count).toBe(articles.length);
            expect(count).toBeGreaterThan(0);
        });

        it("should not count a draft", async () => {
            const before = await articleRepo.countPublishedByAuthorId(authorId);

            await articleRepo.create(makeArticle({ title: "Uncounted draft" }));

            expect(await articleRepo.countPublishedByAuthorId(authorId)).toBe(
                before,
            );
        });

        it("should not count an archived article", async () => {
            const before = await articleRepo.countPublishedByAuthorId(authorId);

            const article = await articleRepo.create(
                makeArticle({ title: "Soon archived" }),
            );
            article.publish();
            await articleRepo.update(article);
            expect(await articleRepo.countPublishedByAuthorId(authorId)).toBe(
                before + 1,
            );

            article.archive();
            await articleRepo.update(article);

            expect(await articleRepo.countPublishedByAuthorId(authorId)).toBe(
                before,
            );
        });

        it("should not count another author's articles", async () => {
            const forOther =
                await articleRepo.countPublishedByAuthorId(otherUserId);

            expect(forOther).toBe(0);
        });

        it("should return zero for an unknown author", async () => {
            const count = await articleRepo.countPublishedByAuthorId(
                "00000000-0000-4000-8000-000000000000",
            );

            expect(count).toBe(0);
        });
    });

    describe("delete()", () => {
        it("should remove the article and cascade its likes", async () => {
            const article = await articleRepo.create(
                makeArticle({ title: "Doomed article" }),
            );
            await prisma.articleLike.create({
                data: { articleId: article.id, userId: otherUserId },
            });

            await articleRepo.delete(article.id);

            expect(await articleRepo.findById(article.id)).toBe(null);
            expect(
                await prisma.articleLike.count({
                    where: { articleId: article.id },
                }),
            ).toBe(0);
        });
    });
});
