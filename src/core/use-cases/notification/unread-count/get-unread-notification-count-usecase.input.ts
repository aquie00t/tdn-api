/**
 * Input interface for reading a user's unread notification count.
 */
export interface GetUnreadNotificationCountInput {
    /**
     * The ID of the user whose unread notifications are counted.
     */
    userId: string;
}
