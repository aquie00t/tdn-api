/**
 * Enumeration of notification types for different kinds of user notifications
 */
export enum NotificationType {
    /**
     * Notification when a user starts following another user
     */
    FOLLOW = "FOLLOW",

    /**
     * Notification when a user creates a new post
     */
    NEW_POST = "NEW_POST",

    /**
     * Notification when a user likes another user's post
     */
    LIKE = "LIKE",

    /**
     * Notification when a user comments on another user's post
     */
    COMMENT = "COMMENT",
    /**
     *
     */
    COMMENT_LIKE = "COMMENT_LIKE",

    /**
     * A reply to one of the user's comments
     */
    COMMENT_REPLY = "COMMENT_REPLY",

    /**
     * Notification when a user quotes another user's post
     */
    QUOTE = "QUOTE",
}
