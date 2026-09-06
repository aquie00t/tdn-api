import type { NotificationType } from "../enums";
import type { NotificationProps } from "../interfaces/notification-props.interface";

/**
 * The content a notification points at.
 *
 * At most one of `postId` / `articleId` is set. `commentId` is set alongside
 * one of them whenever the notification concerns a comment, because opening a
 * comment always means opening the post or article it lives under first.
 */
export interface NotificationTarget {
    /** The post the notification points at */
    postId?: string;

    /** The article the notification points at */
    articleId?: string;

    /** The comment the notification points at */
    commentId?: string;
}

/**
 * Rich domain model for Notification entity
 *
 * Encapsulates both data and business logic related to notifications.
 * Notifications are used to inform users about various activities and events
 * within the application such as follows, likes, comments, etc.
 *
 * This entity follows domain-driven design principles by encapsulating
 * business logic and validation within the entity itself.
 */
export class Notification {
    private constructor(private readonly props: NotificationProps) {}

    /**
     * Creates a new Notification entity with minimal required data.
     *
     * Factory method that ensures all required properties are provided
     * while setting sensible defaults for optional properties.
     *
     * `referenceId` is derived from the target rather than passed in, so every
     * notification that has somewhere to go carries one: the most specific id
     * wins - the comment, else the article, else the post.
     *
     * @param recipientId - The ID of the user receiving the notification
     * @param issuerId - The ID of the user issuing the notification
     * @param type - The type of the notification
     * @param target - What the notification points at, empty for a follow
     * @returns A new Notification entity
     */
    public static create(
        recipientId: string,
        issuerId: string,
        type: NotificationType,
        target: NotificationTarget = {},
    ): Notification {
        const { postId, articleId, commentId } = target;

        return new Notification({
            recipientId,
            issuerId,
            type,
            referenceId: commentId ?? articleId ?? postId,
            postId,
            articleId,
            commentId,
            username: undefined,
            avatarUrl: undefined,
            createdAt: undefined,
            isRead: false,
        });
    }

    public static with(props: NotificationProps): Notification {
        return new Notification(props);
    }

    /**
     * Get the ID of the user who received this notification
     * @returns The recipient user ID
     */
    get recipientId(): string {
        return this.props.recipientId;
    }

    /**
     * Get the ID of the user who issued this notification
     * @returns The issuer user ID
     */
    get issuerId(): string {
        return this.props.issuerId;
    }

    /**
     * Get the username of the notification issuer
     * @returns The username or undefined if not provided
     */
    get username(): string | undefined {
        return this.props.username;
    }

    /**
     * Get the type of the notification
     * @returns The notification type enum value
     */
    get type(): NotificationType {
        return this.props.type;
    }

    /**
     * Get the avatar URL of the notification issuer
     * @returns The avatar URL or undefined if not provided
     */
    get avatarUrl(): string | undefined {
        return this.props.avatarUrl;
    }

    /**
     * Whether the issuer carries the paid verification badge
     * @returns True while the badge is granted
     */
    get isVerified(): boolean {
        return this.props.isVerified ?? false;
    }

    /**
     * Get the reference ID of the notification (optional)
     * @returns The reference ID or undefined if not provided
     */
    get referenceId(): string | undefined {
        return this.props.referenceId;
    }

    /**
     * Get the ID of the notification itself
     * @returns The notification ID, or undefined while it is not persisted yet
     */
    get id(): string | undefined {
        return this.props.id;
    }

    /**
     * Get the ID of the post this notification points at
     * @returns The post ID or undefined when it concerns something else
     */
    get postId(): string | undefined {
        return this.props.postId;
    }

    /**
     * Get the ID of the article this notification points at
     * @returns The article ID or undefined when it concerns something else
     */
    get articleId(): string | undefined {
        return this.props.articleId;
    }

    /**
     * Get the ID of the comment this notification points at
     * @returns The comment ID or undefined when it concerns something else
     */
    get commentId(): string | undefined {
        return this.props.commentId;
    }

    /**
     * Get the slug of the linked article, resolved when the notification is read
     * @returns The article slug or undefined when no article is linked
     */
    get articleSlug(): string | undefined {
        return this.props.articleSlug;
    }

    /**
     * Get the creation date of the notification
     * @returns The creation timestamp
     */
    get createdAt(): Date {
        return this.props.createdAt!;
    }

    /**
     * Check if the notification has been read
     * @returns True if the notification is marked as read, false otherwise
     */
    get isRead(): boolean {
        return this.props.isRead;
    }

    /**
     * Check if the notification is unread
     * @returns True if the notification is unread, false if read
     */
    public isUnread(): boolean {
        return !this.props.isRead;
    }

    /**
     * Mark the notification as read
     * This method mutates the entity state to mark it as read
     */
    public markAsRead(): void {
        this.props.isRead = true;
    }
}
