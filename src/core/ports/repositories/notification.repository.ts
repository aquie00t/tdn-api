import type { Notification } from "@core/domain/entities/notification.entity";
import type { NotificationType } from "@core/domain/enums/notification-type.enum";

/**
 * Parameters for paginated notification retrieval.
 */
export interface FindNotificationsInput {
    userId: string;
    take: number;
    skip: number;
}

/**
 * Identifies the notification a single undone action produced.
 *
 * Every field participates in the match, and a target left out must be null
 * in the row: a like on a post and a like on an article are the same type
 * from the same issuer to the same recipient, and only the target tells them
 * apart.
 */
export interface DeleteNotificationInput {
    /** The user the notification was delivered to. */
    recipientId: string;

    /** The user whose action produced it. */
    issuerId: string;

    /** The kind of notification to remove. */
    type: NotificationType;

    /** The post it points at, when it points at one. */
    postId?: string;

    /** The article it points at, when it points at one. */
    articleId?: string;

    /** The comment it points at, when it points at one. */
    commentId?: string;
}

/**
 * Repository interface for managing Notification entities.
 * Following Clean Architecture principles, this interface defines the contract
 * for persisting and retrieving Notification domain entities without exposing
 * implementation details or DTOs.
 */
export interface INotificationRepository {
    /**
     * Creates a new notification entity in the persistence layer.
     * @param notification - The Notification entity to be created.
     */
    create(notification: Notification): Promise<void>;

    /**
     * Creates many notifications in a single write.
     *
     * Backs fan-out, where one event notifies every follower of an account.
     * Unlike {@link create} this does not trim the recipient's history: that
     * trim costs two extra queries per recipient, which would turn a fan-out
     * into 2N+1 queries and defeat the batch. Age is bounded by the
     * notification purge job instead.
     *
     * @param notifications - The Notification entities to be created.
     * @returns The number of notifications written.
     */
    createMany(notifications: Notification[]): Promise<number>;

    /**
     * Retrieves the count of unread notifications for a specific user.
     * @param userId - The unique identifier of the user.
     * @returns The number of unread notifications.
     */
    getUnreadCount(userId: string): Promise<number>;

    /**
     * Lists the notifications a user has not read since a point in time.
     *
     * The digest asks "what did you miss", which `getUnreadCount` can only
     * answer with a number and `findAllByUserId` answers with read and unread
     * alike. Bounded by `since` so a user who never opens their notifications
     * is not mailed the same backlog every morning.
     *
     * @param userId - The recipient.
     * @param since - Oldest notification to consider.
     * @param take - Most notifications to return, newest first.
     * @returns The matching notifications, issuer and article slug loaded.
     */
    findUnreadSince(
        userId: string,
        since: Date,
        take: number,
    ): Promise<Notification[]>;

    /**
     * Retrieves a paginated list of notifications for a specific user.
     * @param input - Pagination parameters including user ID, take, and skip.
     * @returns An array of Notification entities.
     */
    findAllByUserId(input: FindNotificationsInput): Promise<Notification[]>;

    /**
     * Retrieves the total count of notifications for a specific user.
     * @param userId - The unique identifier of the user.
     * @returns The total number of notifications.
     */
    countByUserId(userId: string): Promise<number>;

    /**
     * Deletes the notification an undone action had produced.
     *
     * Unliking or unfollowing must take its notification back with it,
     * otherwise the recipient keeps a notification for something that no
     * longer happened, and toggling the action piles up duplicates.
     *
     * @param input - The exact notification to remove.
     * @returns The number of notifications deleted, zero when none matched.
     */
    deleteByTarget(input: DeleteNotificationInput): Promise<number>;

    /**
     * Marks a single notification as read.
     *
     * Scoped to the recipient on purpose: a notification that belongs to
     * somebody else must be indistinguishable from one that does not exist.
     *
     * @param notificationId - The unique identifier of the notification.
     * @param recipientId - The user the notification must belong to.
     * @returns True when a notification was updated, false when none matched.
     */
    markAsRead(notificationId: string, recipientId: string): Promise<boolean>;

    /**
     * Marks all notifications for a specific user as read.
     * @param userId - The unique identifier of the user.
     */
    markAllAsRead(userId: string): Promise<void>;

    /**
     * Deletes expired notifications based on a cutoff date.
     * @param cutOffDate - The date before which notifications are considered expired.
     * @returns The number of deleted notifications.
     */
    deleteExpiredNotifications(cutOffDate: Date): Promise<number>;
}
