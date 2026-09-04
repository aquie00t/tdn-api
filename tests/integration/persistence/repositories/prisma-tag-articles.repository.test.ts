import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "../../../../src/generated/prisma/client";
import { PrismaTagRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-tag.repository";
import { PrismaArticleRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-article.repository";
import { PrismaUserRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-user.repository";
import { PrismaPostRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-post.repository";
import { Article } from "../../../../src/core/domain/entities/article.entity";
import { Post } from "../../../../src/core/domain/entities/post.entity";
import { PostType } from "../../../../src/core/domain/enums/post-type.enum";
import { createPrismaClient } from "../../helpers/setup";

const EMAIL_DOMAIN = "@tag-article-test.com";

const PUBLISHED_TAG = "artpublishedtag";
const DRAFT_TAG = "artdrafttag";
const ARCHIVED_TAG = "artarchivedtag";
const SHARED_TAG = "artsharedtag";

/**
 * The article half of the tag repository. The post-only suite in
 * prisma-tag.repository.test.ts is left untouched so it doubles as the
 * regression gate for the rewrite.
 */
describe("PrismaTagRepository with articles (integration)", () => {
    let prisma: PrismaClient;
    let tagRepo: PrismaTagRepository;
    let articleRepo: PrismaArticleRepository;
    let userId: string;
    let suffix = 0;

    const nextSuffix = (): string => (++suffix).toString(16).padStart(8, "0");

    /**
     * Creates an article carrying the given tags, optionally publishing it.
     */
    const makeArticle = async (
        title: string,
        tags: string[],
        state: "draft" | "published" | "archived",
    ): Promise<void> => {
        const article = await articleRepo.create(
            Article.create({
                title,
                body: "Body prose for the tag tests.",
                authorId: userId,
                slugSuffix: nextSuffix(),
                tags,
            }),
        );

        if (state === "draft") return;

        article.publish();
        if (state === "archived") article.archive();
        await articleRepo.update(article);
    };

    beforeAll(async () => {
        prisma = createPrismaClient();
        tagRepo = new PrismaTagRepository(prisma);
        articleRepo = new PrismaArticleRepository(prisma);

        const user = await new PrismaUserRepository(prisma, {
            gracePeriodDays: 30,
        }).create({
            email: `tagarticle${EMAIL_DOMAIN}`,
            username: "tagarticle_user",
            passwordHash: "hashed",
        });
        userId = user.id;

        await makeArticle(
            "Published tagged article",
            [PUBLISHED_TAG],
            "published",
        );
        await makeArticle("Draft tagged article", [DRAFT_TAG], "draft");
        await makeArticle(
            "Archived tagged article",
            [ARCHIVED_TAG],
            "archived",
        );

        // One tag used by both a post and a published article, to prove the
        // two counts are reported separately and ranked together.
        await makeArticle("Shared tag article", [SHARED_TAG], "published");
        await new PrismaPostRepository(prisma).create(
            Post.create(
                `A post about #${SHARED_TAG}`,
                PostType.COMMUNITY,
                userId,
            ),
        );
    });

    afterAll(async () => {
        await prisma.article.deleteMany({ where: { authorId: userId } });
        await prisma.post.deleteMany({ where: { authorId: userId } });
        await prisma.tag.deleteMany({
            where: {
                name: {
                    in: [PUBLISHED_TAG, DRAFT_TAG, ARCHIVED_TAG, SHARED_TAG],
                },
            },
        });
        await prisma.user.deleteMany({
            where: { email: { contains: EMAIL_DOMAIN } },
        });
        await prisma.$disconnect();
    });

    describe("findTrending()", () => {
        it("should include a tag used only by a published article", async () => {
            const trends = await tagRepo.findTrending({
                limit: 100,
                windowDays: 7,
            });
            const entry = trends.find((t) => t.tag === PUBLISHED_TAG);

            expect(entry).toBeDefined();
            expect(entry?.articleCount).toBe(1);
            expect(entry?.postCount).toBe(0);
        });

        it("should never let a draft push its tag into the trends", async () => {
            const trends = await tagRepo.findTrending({
                limit: 100,
                windowDays: 7,
            });

            expect(trends.map((t) => t.tag)).not.toContain(DRAFT_TAG);
        });

        it("should exclude an archived article", async () => {
            const trends = await tagRepo.findTrending({
                limit: 100,
                windowDays: 7,
            });

            expect(trends.map((t) => t.tag)).not.toContain(ARCHIVED_TAG);
        });

        it("should report post and article counts separately", async () => {
            const trends = await tagRepo.findTrending({
                limit: 100,
                windowDays: 7,
            });
            const entry = trends.find((t) => t.tag === SHARED_TAG);

            expect(entry?.postCount).toBe(1);
            expect(entry?.articleCount).toBe(1);
        });

        it("should rank by the two counts combined", async () => {
            const trends = await tagRepo.findTrending({
                limit: 100,
                windowDays: 7,
            });
            const shared = trends.findIndex((t) => t.tag === SHARED_TAG);
            const publishedOnly = trends.findIndex(
                (t) => t.tag === PUBLISHED_TAG,
            );

            expect(shared).toBeGreaterThanOrEqual(0);
            expect(publishedOnly).toBeGreaterThanOrEqual(0);
            expect(shared).toBeLessThan(publishedOnly);
        });

        it("should honour the limit", async () => {
            const trends = await tagRepo.findTrending({
                limit: 1,
                windowDays: 7,
            });

            expect(trends).toHaveLength(1);
        });

        it("should exclude articles published before the window", async () => {
            const trends = await tagRepo.findTrending({
                limit: 100,
                windowDays: 0,
            });

            expect(trends.map((t) => t.tag)).not.toContain(PUBLISHED_TAG);
        });
    });

    describe("search()", () => {
        it("should report the article count for a matching tag", async () => {
            const results = await tagRepo.search(PUBLISHED_TAG, 10);

            expect(results[0]?.name).toBe(PUBLISHED_TAG);
            expect(results[0]?.articleCount).toBe(1);
            expect(results[0]?.postCount).toBe(0);
        });

        it("should not count a draft article", async () => {
            const results = await tagRepo.search(DRAFT_TAG, 10);
            const entry = results.find((t) => t.name === DRAFT_TAG);

            // The tag row exists because the draft created it, but it must not
            // be presented as used.
            expect(entry?.articleCount ?? 0).toBe(0);
        });

        it("should rank by posts and articles combined", async () => {
            const results = await tagRepo.search("art", 50);
            const shared = results.findIndex((t) => t.name === SHARED_TAG);
            const publishedOnly = results.findIndex(
                (t) => t.name === PUBLISHED_TAG,
            );

            expect(shared).toBeGreaterThanOrEqual(0);
            expect(shared).toBeLessThan(publishedOnly);
        });

        it("should honour the limit", async () => {
            const results = await tagRepo.search("art", 1);

            expect(results).toHaveLength(1);
        });
    });
});
