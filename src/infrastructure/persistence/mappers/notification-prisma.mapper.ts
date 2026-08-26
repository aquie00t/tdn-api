import type { NotificationType } from "@generated/prisma/client";
import type { NotificationType as CoreNotificationType } from "@core/domain/enums/notification-type.enum";
import { Notification } from "@core/domain/entities/notification.entity";

export interface PrismaNotificationItem {
    id: string;
    createdAt: Date;
    type: NotificationType;
    recipientId: string;
    issuerId: string;
    referenceId: string | null;
    postId: string | null;
    articleId: string | null;
    commentId: string | null;
    isRead: boolean;
    issuer: {
        username: string;
        profile: {
            avatarUrl: string;
        } | null;
    };
    // Articles are read by slug, so the slug travels with the notification and
    // the client never has to resolve an article id into a URL.
    article: {
        slug: string;
    } | null;
}

export class NotificationPrismaMapper {
    /**
     * Maps a Prisma notification item to a domain entity.
     *
     * @param item - The Prisma notification item with issuer relations
     * @returns The instantiated Notification domain entity
     */
    public static toDomain(item: PrismaNotificationItem): Notification {
        return Notification.with({
            id: item.id,
            recipientId: item.recipientId,
            issuerId: item.issuerId,
            type: item.type as unknown as CoreNotificationType,
            referenceId: item.referenceId || undefined,
            postId: item.postId || undefined,
            articleId: item.articleId || undefined,
            commentId: item.commentId || undefined,
            articleSlug: item.article?.slug,
            username: item.issuer.username,
            avatarUrl: item.issuer.profile?.avatarUrl ?? "",
            createdAt: item.createdAt,
            isRead: item.isRead,
        });
    }

    /**
     * Maps a Notification domain entity to a safe API response object.
     * Applies CDN URL normalization to the avatar URL.
     *
     * @param notification - The Notification domain entity
     * @param cdnUrl - Base URL for the CDN to resolve avatar links
     * @returns A sanitized notification object safe for external API responses
     */
    public static toResponse(
        notification: Notification,
        cdnUrl: string,
    ): {
        id?: string;
        avatarUrl: string;
        createdAt: Date;
        type: CoreNotificationType;
        recipientId: string;
        issuerId: string;
        referenceId?: string;
        postId?: string;
        articleId?: string;
        articleSlug?: string;
        commentId?: string;
        username: string;
        isRead: boolean;
    } {
        return {
            id: notification.id,
            avatarUrl: notification.avatarUrl
                ? notification.avatarUrl.startsWith("http")
                    ? notification.avatarUrl
                    : notification.avatarUrl.includes("default_profile")
                      ? `${cdnUrl}/${notification.avatarUrl}?v=1`
                      : `${cdnUrl}/${notification.avatarUrl}`
                : `${cdnUrl}/default-avatar.png`,
            createdAt: notification.createdAt,
            type: notification.type as CoreNotificationType,
            recipientId: notification.recipientId,
            issuerId: notification.issuerId,
            referenceId: notification.referenceId,
            postId: notification.postId,
            articleId: notification.articleId,
            articleSlug: notification.articleSlug,
            commentId: notification.commentId,
            username: notification.username || "",
            isRead: notification.isRead,
        };
    }

    /**
     * Maps a Notification entity to Prisma notification data
     * @param notification - The Notification entity
     * @returns Prisma notification data
     */
    public static toPrisma(notification: Notification): {
        recipientId: string;
        issuerId: string;
        type: NotificationType;
        referenceId?: string | null;
        postId?: string | null;
        articleId?: string | null;
        commentId?: string | null;
    } {
        return {
            recipientId: notification.recipientId,
            issuerId: notification.issuerId,
            type: notification.type as unknown as NotificationType,
            referenceId: notification.referenceId || null,
            postId: notification.postId || null,
            articleId: notification.articleId || null,
            commentId: notification.commentId || null,
        };
    }
}
