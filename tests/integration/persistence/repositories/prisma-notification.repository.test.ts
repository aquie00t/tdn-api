import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "../../../../src/generated/prisma/client";
import { PrismaNotificationRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-notification.repository";
import { PrismaUserRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-user.repository";
import { Notification } from "../../../../src/core/domain/entities/notification.entity";
import { NotificationType } from "../../../../src/core/domain/enums/notification-type.enum";
import { createPrismaClient } from "../../helpers/setup";

describe("PrismaNotificationRepository (integration)", () => {
    let prisma: PrismaClient;
    let notifRepo: PrismaNotificationRepository;
    let recipientId: string;
    let issuerId: string;

    beforeAll(async () => {
        prisma = createPrismaClient();
        notifRepo = new PrismaNotificationRepository(prisma);

        const userRepo = new PrismaUserRepository(prisma, {
            gracePeriodDays: 30,
        });
        const [recipient, issuer] = await Promise.all([
            userRepo.create({
                email: "recipient@notif-repo-test.com",
                username: "recipient_notifrepo",
                passwordHash: "hashed",
            }),
            userRepo.create({
                email: "issuer@notif-repo-test.com",
                username: "issuer_notifrepo",
                passwordHash: "hashed",
            }),
        ]);
        recipientId = recipient.id;
        issuerId = issuer.id;
    });

    afterAll(async () => {
        await prisma.notification.deleteMany({
            where: { recipientId },
        });
        await prisma.user.deleteMany({
            where: { email: { contains: "@notif-repo-test.com" } },
        });
        await prisma.$disconnect();
    });

    describe("create() / findAllByUserId()", () => {
        it("should persist a notification and retrieve it", async () => {
            const notif = Notification.create(
                recipientId,
                issuerId,
                NotificationType.FOLLOW,
            );

            await notifRepo.create(notif);

            const results = await notifRepo.findAllByUserId({
                userId: recipientId,
                take: 10,
                skip: 0,
            });

            expect(results.length).toBeGreaterThanOrEqual(1);
            const found = results.find(
                (n) => n.type === NotificationType.FOLLOW,
            );
            expect(found).toBeDefined();
        });
    });

    describe("deep-link targets", () => {
        it("should persist the post a notification points at", async () => {
            const post = await prisma.post.create({
                data: { content: "Target post", authorId: recipientId },
            });

            await notifRepo.create(
                Notification.create(
                    recipientId,
                    issuerId,
                    NotificationType.LIKE,
                    { postId: post.id },
                ),
            );

            const [latest] = await notifRepo.findAllByUserId({
                userId: recipientId,
                take: 1,
                skip: 0,
            });

            expect(latest.postId).toBe(post.id);
            expect(latest.referenceId).toBe(post.id);
            expect(latest.id).toBeDefined();

            await prisma.post.delete({ where: { id: post.id } });
        });

        it("should resolve the article slug so the client can build a URL", async () => {
            const article = await prisma.article.create({
                data: {
                    slug: "notification-target-article",
                    title: "Notification target",
                    body: "body",
                    authorId: recipientId,
                },
            });
            const comment = await prisma.comment.create({
                data: {
                    content: "A comment",
                    articleId: article.id,
                    authorId: recipientId,
                },
            });

            await notifRepo.create(
                Notification.create(
                    recipientId,
                    issuerId,
                    NotificationType.COMMENT_REPLY,
                    { commentId: comment.id, articleId: article.id },
                ),
            );

            const [latest] = await notifRepo.findAllByUserId({
                userId: recipientId,
                take: 1,
                skip: 0,
            });

            expect(latest.commentId).toBe(comment.id);
            expect(latest.articleId).toBe(article.id);
            expect(latest.articleSlug).toBe("notification-target-article");
            expect(latest.referenceId).toBe(comment.id);

            await prisma.article.delete({ where: { id: article.id } });
        });

        it("should drop the notification when its target is deleted", async () => {
            const post = await prisma.post.create({
                data: { content: "Doomed post", authorId: recipientId },
            });

            await notifRepo.create(
                Notification.create(
                    recipientId,
                    issuerId,
                    NotificationType.LIKE,
                    { postId: post.id },
                ),
            );

            await prisma.post.delete({ where: { id: post.id } });

            const orphans = await prisma.notification.count({
                where: { postId: post.id },
            });
            expect(orphans).toBe(0);
        });
    });

    describe("getUnreadCount()", () => {
        it("should return count of unread notifications", async () => {
            const count = await notifRepo.getUnreadCount(recipientId);
            expect(count).toBeGreaterThanOrEqual(1);
        });
    });

    describe("markAllAsRead()", () => {
        it("should set isRead=true for all recipient notifications", async () => {
            await notifRepo.markAllAsRead(recipientId);

            const count = await notifRepo.getUnreadCount(recipientId);
            expect(count).toBe(0);
        });
    });

    describe("100-notification cap", () => {
        it("should delete oldest notifications when cap is exceeded", async () => {
            // Bulk-insert 98 notifications directly to reach 99 total (1 already exists)
            // without triggering the cap check logic on each insert.
            const bulkData = Array.from({ length: 98 }, (_, i) => ({
                recipientId,
                issuerId,
                type: NotificationType.LIKE,
                referenceId: `post_bulk_${i}`,
                isRead: false,
            }));
            await prisma.notification.createMany({ data: bulkData });

            await notifRepo.create(
                Notification.create(
                    recipientId,
                    issuerId,
                    NotificationType.LIKE,
                ),
            );

            const countAt100 = await prisma.notification.count({
                where: { recipientId },
            });
            expect(countAt100).toBe(100);

            await notifRepo.create(
                Notification.create(
                    recipientId,
                    issuerId,
                    NotificationType.LIKE,
                ),
            );

            const total = await prisma.notification.count({
                where: { recipientId },
            });
            expect(total).toBeLessThanOrEqual(100);
        });
    });

    describe("deleteExpiredNotifications()", () => {
        it("should delete notifications older than the cutoff date", async () => {
            const userRepo = new PrismaUserRepository(prisma, {
                gracePeriodDays: 30,
            });
            const freshUser = await userRepo.create({
                email: "freshexpiry@notif-repo-test.com",
                username: "freshexpiry_notifrepo",
                passwordHash: "hashed",
            });

            await prisma.notification.create({
                data: {
                    recipientId: freshUser.id,
                    issuerId,
                    type: NotificationType.FOLLOW,
                    isRead: false,
                    createdAt: new Date("2000-01-01"),
                },
            });
            await notifRepo.create(
                Notification.create(
                    freshUser.id,
                    issuerId,
                    NotificationType.NEW_POST,
                ),
            );

            const cutoff = new Date();
            await notifRepo.deleteExpiredNotifications(cutoff);

            const remaining = await prisma.notification.findMany({
                where: { recipientId: freshUser.id },
            });

            // Old one (2000-01-01) should be gone; recent one kept
            const old = remaining.find(
                (n) => n.createdAt.getFullYear() === 2000,
            );
            expect(old).toBeUndefined();
        });
    });
});
