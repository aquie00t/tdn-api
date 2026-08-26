import { describe, it, expect } from "vitest";
import { Notification } from "@core/domain/entities/notification.entity";
import { NotificationType } from "@core/domain/enums/notification-type.enum";
import type { NotificationProps } from "@core/domain/interfaces/notification-props.interface";

function buildNotification(
    overrides: Partial<NotificationProps> = {},
): Notification {
    return Notification.with({
        recipientId: "recipient-1",
        issuerId: "issuer-1",
        type: NotificationType.FOLLOW,
        isRead: false,
        referenceId: undefined,
        username: undefined,
        avatarUrl: undefined,
        createdAt: undefined,
        ...overrides,
    });
}

describe("Notification Entity", () => {
    describe("Notification.create() factory", () => {
        it("should create a notification with required fields", () => {
            const n = Notification.create(
                "recipient-1",
                "issuer-1",
                NotificationType.FOLLOW,
            );
            expect(n.recipientId).toBe("recipient-1");
            expect(n.issuerId).toBe("issuer-1");
            expect(n.type).toBe(NotificationType.FOLLOW);
        });

        it("should default isRead to false", () => {
            const n = Notification.create(
                "recipient-1",
                "issuer-1",
                NotificationType.LIKE,
            );
            expect(n.isRead).toBe(false);
        });

        it("should default username to undefined", () => {
            const n = Notification.create(
                "recipient-1",
                "issuer-1",
                NotificationType.FOLLOW,
            );
            expect(n.username).toBeUndefined();
        });

        it("should default avatarUrl to undefined", () => {
            const n = Notification.create(
                "recipient-1",
                "issuer-1",
                NotificationType.FOLLOW,
            );
            expect(n.avatarUrl).toBeUndefined();
        });

        it("should carry the post target and mirror it onto referenceId", () => {
            const n = Notification.create(
                "recipient-1",
                "issuer-1",
                NotificationType.LIKE,
                { postId: "post-42" },
            );
            expect(n.postId).toBe("post-42");
            expect(n.referenceId).toBe("post-42");
            expect(n.articleId).toBeUndefined();
            expect(n.commentId).toBeUndefined();
        });

        it("should carry the article target and mirror it onto referenceId", () => {
            const n = Notification.create(
                "recipient-1",
                "issuer-1",
                NotificationType.LIKE,
                { articleId: "article-7" },
            );
            expect(n.articleId).toBe("article-7");
            expect(n.referenceId).toBe("article-7");
            expect(n.postId).toBeUndefined();
        });

        it("should keep both the comment and the post it lives under", () => {
            const n = Notification.create(
                "recipient-1",
                "issuer-1",
                NotificationType.COMMENT_LIKE,
                { commentId: "comment-9", postId: "post-42" },
            );
            expect(n.commentId).toBe("comment-9");
            expect(n.postId).toBe("post-42");
        });

        it("should prefer the comment id for referenceId over its parent", () => {
            const n = Notification.create(
                "recipient-1",
                "issuer-1",
                NotificationType.COMMENT_REPLY,
                { commentId: "comment-9", articleId: "article-7" },
            );
            expect(n.referenceId).toBe("comment-9");
        });

        it("should leave every target id undefined for a follow", () => {
            const n = Notification.create(
                "recipient-1",
                "issuer-1",
                NotificationType.FOLLOW,
            );
            expect(n.postId).toBeUndefined();
            expect(n.articleId).toBeUndefined();
            expect(n.commentId).toBeUndefined();
        });

        it("should leave id undefined until the notification is persisted", () => {
            const n = Notification.create(
                "recipient-1",
                "issuer-1",
                NotificationType.FOLLOW,
            );
            expect(n.id).toBeUndefined();
        });

        it("should leave referenceId undefined when not provided", () => {
            const n = Notification.create(
                "recipient-1",
                "issuer-1",
                NotificationType.FOLLOW,
            );
            expect(n.referenceId).toBeUndefined();
        });

        it.each([
            NotificationType.FOLLOW,
            NotificationType.NEW_POST,
            NotificationType.LIKE,
            NotificationType.COMMENT,
            NotificationType.COMMENT_LIKE,
        ])("should support NotificationType.%s", (type) => {
            const n = Notification.create("recipient-1", "issuer-1", type);
            expect(n.type).toBe(type);
        });
    });

    describe("Getters", () => {
        it("should return correct recipientId", () => {
            const n = buildNotification({ recipientId: "user-99" });
            expect(n.recipientId).toBe("user-99");
        });

        it("should return correct issuerId", () => {
            const n = buildNotification({ issuerId: "user-42" });
            expect(n.issuerId).toBe("user-42");
        });

        it("should return username when set", () => {
            const n = buildNotification({ username: "johndoe" });
            expect(n.username).toBe("johndoe");
        });

        it("should return avatarUrl when set", () => {
            const n = buildNotification({
                avatarUrl: "https://cdn.example.com/avatar.jpg",
            });
            expect(n.avatarUrl).toBe("https://cdn.example.com/avatar.jpg");
        });
    });

    describe("isUnread()", () => {
        it("should return true when isRead is false", () => {
            const n = buildNotification({ isRead: false });
            expect(n.isUnread()).toBe(true);
        });

        it("should return false when isRead is true", () => {
            const n = buildNotification({ isRead: true });
            expect(n.isUnread()).toBe(false);
        });

        it("should be consistent with isRead getter", () => {
            const n = buildNotification({ isRead: false });
            expect(n.isRead).toBe(false);
            expect(n.isUnread()).toBe(true);
        });
    });
});
