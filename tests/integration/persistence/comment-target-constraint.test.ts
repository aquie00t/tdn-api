import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { PrismaUserRepository } from "../../../src/infrastructure/persistence/repositories/prisma-user.repository";
import { PrismaArticleRepository } from "../../../src/infrastructure/persistence/repositories/prisma-article.repository";
import { PrismaPostRepository } from "../../../src/infrastructure/persistence/repositories/prisma-post.repository";
import { Article } from "../../../src/core/domain/entities/article.entity";
import { Post } from "../../../src/core/domain/entities/post.entity";
import { PostType } from "../../../src/core/domain/enums/post-type.enum";
import { createPrismaClient } from "../helpers/setup";

const EMAIL_DOMAIN = "@comment-constraint-test.com";

/**
 * The comments_target_xor CHECK constraint is written by hand in the migration
 * because Prisma cannot express one, which also means Prisma does not know it
 * exists. These tests are the guard: if a future migrate dev regenerates the
 * table without the constraint, they fail rather than the invariant quietly
 * disappearing.
 */
describe("comments target constraint (integration)", () => {
    let prisma: PrismaClient;
    let userId: string;
    let postId: string;
    let articleId: string;

    beforeAll(async () => {
        prisma = createPrismaClient();

        const user = await new PrismaUserRepository(prisma, {
            gracePeriodDays: 30,
        }).create({
            email: `constraint${EMAIL_DOMAIN}`,
            username: "constraint_user",
            passwordHash: "hashed",
        });
        userId = user.id;

        const post = await new PrismaPostRepository(prisma).create(
            Post.create("A post to comment on", PostType.COMMUNITY, userId),
        );
        postId = post.id;

        const article = await new PrismaArticleRepository(prisma).create(
            Article.create({
                title: "An article to comment on",
                body: "Body prose.",
                authorId: userId,
                slugSuffix: "c0nstra1",
            }),
        );
        articleId = article.id;
    });

    afterAll(async () => {
        await prisma.comment.deleteMany({ where: { authorId: userId } });
        await prisma.article.deleteMany({ where: { authorId: userId } });
        await prisma.post.deleteMany({ where: { authorId: userId } });
        await prisma.user.deleteMany({
            where: { email: { contains: EMAIL_DOMAIN } },
        });
        await prisma.$disconnect();
    });

    it("should accept a comment attached to a post", async () => {
        const comment = await prisma.comment.create({
            data: { content: "On a post", authorId: userId, postId },
        });

        expect(comment.postId).toBe(postId);
        expect(comment.articleId).toBeNull();
    });

    it("should accept a comment attached to an article", async () => {
        const comment = await prisma.comment.create({
            data: { content: "On an article", authorId: userId, articleId },
        });

        expect(comment.articleId).toBe(articleId);
        expect(comment.postId).toBeNull();
    });

    it("should reject a comment attached to nothing", async () => {
        await expect(
            prisma.comment.create({
                data: { content: "Orphan", authorId: userId },
            }),
        ).rejects.toThrow();
    });

    it("should reject a comment attached to both a post and an article", async () => {
        await expect(
            prisma.comment.create({
                data: {
                    content: "Both at once",
                    authorId: userId,
                    postId,
                    articleId,
                },
            }),
        ).rejects.toThrow();
    });

    it("should reject an update that clears both targets", async () => {
        const comment = await prisma.comment.create({
            data: { content: "Will be orphaned", authorId: userId, postId },
        });

        await expect(
            prisma.comment.update({
                where: { id: comment.id },
                data: { postId: null },
            }),
        ).rejects.toThrow();
    });

    it("should reject an update that sets the second target", async () => {
        const comment = await prisma.comment.create({
            data: { content: "Will point at both", authorId: userId, postId },
        });

        await expect(
            prisma.comment.update({
                where: { id: comment.id },
                data: { articleId },
            }),
        ).rejects.toThrow();
    });

    it("should remove article comments when the article is deleted", async () => {
        const article = await new PrismaArticleRepository(prisma).create(
            Article.create({
                title: "Short lived article",
                body: "Body prose.",
                authorId: userId,
                slugSuffix: "d00med01",
            }),
        );
        await prisma.comment.create({
            data: {
                content: "Goes away with the article",
                authorId: userId,
                articleId: article.id,
            },
        });

        await prisma.article.delete({ where: { id: article.id } });

        expect(
            await prisma.comment.count({ where: { articleId: article.id } }),
        ).toBe(0);
    });
});
