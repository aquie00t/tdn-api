import { describe, expect, it } from "vitest";
import {
    NotificationPrismaMapper,
    type PrismaNotificationItem,
} from "@infrastructure/persistence/mappers/notification-prisma.mapper";
import { Notification } from "@core/domain/entities/notification.entity";
import { NotificationType } from "@core/domain/enums/notification-type.enum";

const CDN = "https://cdn.example.com";
const now = new Date("2025-01-01T00:00:00.000Z");

function makePrismaItem(
    overrides: Partial<PrismaNotificationItem> = {},
): PrismaNotificationItem {
    return {
        id: "notif-1",
        createdAt: now,
        type: "FOLLOW" as PrismaNotificationItem["type"],
        recipientId: "user-1",
        issuerId: "user-2",
        referenceId: null,
        postId: null,
        articleId: null,
        commentId: null,
        isRead: false,
        issuer: {
            username: "follower",
            profile: { avatarUrl: "uploads/avatar.jpg" },
        },
        article: null,
        ...overrides,
    };
}

describe("NotificationPrismaMapper", () => {
    describe("toDomain", () => {
        it("should return a Notification domain entity", () => {
            const result = NotificationPrismaMapper.toDomain(makePrismaItem());

            expect(result).toBeInstanceOf(Notification);
        });

        it("should map all fields to the entity correctly", () => {
            const result = NotificationPrismaMapper.toDomain(makePrismaItem());

            expect(result.recipientId).toBe("user-1");
            expect(result.issuerId).toBe("user-2");
            expect(result.username).toBe("follower");
            expect(result.isRead).toBe(false);
            expect(result.createdAt).toBe(now);
        });

        it("should cast type string to CoreNotificationType", () => {
            const result = NotificationPrismaMapper.toDomain(makePrismaItem());

            expect(result.type).toBe(NotificationType.FOLLOW);
        });

        it("should set avatarUrl from issuer profile", () => {
            const result = NotificationPrismaMapper.toDomain(makePrismaItem());

            expect(result.avatarUrl).toBe("uploads/avatar.jpg");
        });

        it("should default avatarUrl to empty string when profile is null", () => {
            const result = NotificationPrismaMapper.toDomain(
                makePrismaItem({
                    issuer: { username: "follower", profile: null },
                }),
            );

            expect(result.avatarUrl).toBe("");
        });

        it("should map the id so a single notification can be addressed", () => {
            const result = NotificationPrismaMapper.toDomain(makePrismaItem());

            expect(result.id).toBe("notif-1");
        });

        it("should map the deep-link target of a comment notification", () => {
            const result = NotificationPrismaMapper.toDomain(
                makePrismaItem({
                    type: "COMMENT_LIKE" as PrismaNotificationItem["type"],
                    referenceId: "comment-9",
                    commentId: "comment-9",
                    postId: "post-42",
                }),
            );

            expect(result.commentId).toBe("comment-9");
            expect(result.postId).toBe("post-42");
            expect(result.articleId).toBeUndefined();
        });

        it("should map the article slug so the client can build its URL", () => {
            const result = NotificationPrismaMapper.toDomain(
                makePrismaItem({
                    referenceId: "article-7",
                    articleId: "article-7",
                    article: { slug: "clean-architecture-in-practice" },
                }),
            );

            expect(result.articleId).toBe("article-7");
            expect(result.articleSlug).toBe("clean-architecture-in-practice");
        });

        it("should leave articleSlug undefined when no article is linked", () => {
            const result = NotificationPrismaMapper.toDomain(makePrismaItem());

            expect(result.articleSlug).toBeUndefined();
        });

        it("should map referenceId when present", () => {
            const result = NotificationPrismaMapper.toDomain(
                makePrismaItem({ referenceId: "post-42" }),
            );

            expect(result.referenceId).toBe("post-42");
        });

        it("should set referenceId to undefined when DB value is null", () => {
            const result = NotificationPrismaMapper.toDomain(
                makePrismaItem({ referenceId: null }),
            );

            expect(result.referenceId).toBeUndefined();
        });
    });

    describe("toResponse — CDN URL normalization", () => {
        it("should prefix storage path with CDN URL", () => {
            const entity = NotificationPrismaMapper.toDomain(makePrismaItem());
            const result = NotificationPrismaMapper.toResponse(entity, CDN);

            expect(result.avatarUrl).toBe(`${CDN}/uploads/avatar.jpg`);
        });

        it("should not double-prefix when avatarUrl is already an http URL", () => {
            const entity = NotificationPrismaMapper.toDomain(
                makePrismaItem({
                    issuer: {
                        username: "follower",
                        profile: {
                            avatarUrl:
                                "https://lh3.googleusercontent.com/photo.jpg",
                        },
                    },
                }),
            );
            const result = NotificationPrismaMapper.toResponse(entity, CDN);

            expect(result.avatarUrl).toBe(
                "https://lh3.googleusercontent.com/photo.jpg",
            );
        });

        it("should append ?v=1 for default_profile avatars", () => {
            const entity = NotificationPrismaMapper.toDomain(
                makePrismaItem({
                    issuer: {
                        username: "follower",
                        profile: { avatarUrl: "default_profile/avatar.jpg" },
                    },
                }),
            );
            const result = NotificationPrismaMapper.toResponse(entity, CDN);

            expect(result.avatarUrl).toBe(
                `${CDN}/default_profile/avatar.jpg?v=1`,
            );
        });

        it("should fall back to default-avatar.png when avatarUrl is empty", () => {
            const entity = NotificationPrismaMapper.toDomain(
                makePrismaItem({
                    issuer: { username: "follower", profile: null },
                }),
            );
            const result = NotificationPrismaMapper.toResponse(entity, CDN);

            expect(result.avatarUrl).toBe(`${CDN}/default-avatar.png`);
        });

        it("should expose all required response fields", () => {
            const entity = NotificationPrismaMapper.toDomain(makePrismaItem());
            const result = NotificationPrismaMapper.toResponse(entity, CDN);

            expect(result.recipientId).toBe("user-1");
            expect(result.issuerId).toBe("user-2");
            expect(result.username).toBe("follower");
            expect(result.isRead).toBe(false);
            expect(result.type).toBe(NotificationType.FOLLOW);
            expect(result.createdAt).toBe(now);
        });

        it("should set referenceId as undefined when not present", () => {
            const entity = NotificationPrismaMapper.toDomain(makePrismaItem());
            const result = NotificationPrismaMapper.toResponse(entity, CDN);

            expect(result.referenceId).toBeUndefined();
        });

        it("should expose the notification id", () => {
            const entity = NotificationPrismaMapper.toDomain(makePrismaItem());
            const result = NotificationPrismaMapper.toResponse(entity, CDN);

            expect(result.id).toBe("notif-1");
        });

        it("should expose the whole destination of a comment notification", () => {
            const entity = NotificationPrismaMapper.toDomain(
                makePrismaItem({
                    type: "COMMENT_REPLY" as PrismaNotificationItem["type"],
                    referenceId: "comment-9",
                    commentId: "comment-9",
                    articleId: "article-7",
                    article: { slug: "clean-architecture-in-practice" },
                }),
            );
            const result = NotificationPrismaMapper.toResponse(entity, CDN);

            expect(result.commentId).toBe("comment-9");
            expect(result.articleId).toBe("article-7");
            expect(result.articleSlug).toBe("clean-architecture-in-practice");
            expect(result.postId).toBeUndefined();
        });

        it("should leave the destination empty for a follow notification", () => {
            const entity = NotificationPrismaMapper.toDomain(makePrismaItem());
            const result = NotificationPrismaMapper.toResponse(entity, CDN);

            expect(result.postId).toBeUndefined();
            expect(result.articleId).toBeUndefined();
            expect(result.commentId).toBeUndefined();
        });
    });

    describe("toPrisma", () => {
        it("should map entity fields to Prisma shape", () => {
            const entity = NotificationPrismaMapper.toDomain(makePrismaItem());
            const result = NotificationPrismaMapper.toPrisma(entity);

            expect(result.recipientId).toBe("user-1");
            expect(result.issuerId).toBe("user-2");
        });

        it("should cast CoreNotificationType back to Prisma NotificationType", () => {
            const entity = NotificationPrismaMapper.toDomain(makePrismaItem());
            const result = NotificationPrismaMapper.toPrisma(entity);

            expect(result.type).toBe("FOLLOW");
        });

        it("should set referenceId to null when entity referenceId is undefined", () => {
            const entity = NotificationPrismaMapper.toDomain(
                makePrismaItem({ referenceId: null }),
            );
            const result = NotificationPrismaMapper.toPrisma(entity);

            expect(result.referenceId).toBeNull();
        });

        it("should persist the target ids of a comment notification", () => {
            const entity = NotificationPrismaMapper.toDomain(
                makePrismaItem({
                    referenceId: "comment-9",
                    commentId: "comment-9",
                    postId: "post-42",
                }),
            );
            const result = NotificationPrismaMapper.toPrisma(entity);

            expect(result.commentId).toBe("comment-9");
            expect(result.postId).toBe("post-42");
            expect(result.articleId).toBeNull();
        });

        it("should pass referenceId through when present", () => {
            const entity = NotificationPrismaMapper.toDomain(
                makePrismaItem({ referenceId: "post-42" }),
            );
            const result = NotificationPrismaMapper.toPrisma(entity);

            expect(result.referenceId).toBe("post-42");
        });
    });
});
