/**
 * Input interface for marking a single notification as read.
 */
export interface MarkNotificationAsReadUseCaseInput {
    /**
     * The ID of the notification to mark as read.
     */
    notificationId: string;

    /**
     * The ID of the user the notification must belong to.
     */
    userId: string;
}
