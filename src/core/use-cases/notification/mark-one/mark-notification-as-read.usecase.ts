import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import { NotFoundError } from "@core/errors";
import type { MarkNotificationAsReadUseCaseInput } from "./mark-notification-as-read-usecase.input";

/**
 * Use case for marking one notification as read.
 *
 * This is what a client calls when the user taps a notification, so the
 * unread badge drops by one instead of the whole list being cleared.
 */
export class MarkNotificationAsReadUseCase {
    /**
     * Creates a new instance of MarkNotificationAsReadUseCase.
     *
     * @param notificationRepository - Repository for managing notifications
     */
    constructor(
        private readonly notificationRepository: INotificationRepository,
    ) {}

    /**
     * Executes the mark as read process.
     *
     * @param input - The notification to mark and the user it must belong to
     * @returns Promise<void> - Resolves once the notification is read
     *
     * @throws NotFoundError - When the notification does not exist or belongs
     * to somebody else. The two cases answer identically on purpose: telling
     * them apart would confirm that a notification id is real.
     */
    async execute(input: MarkNotificationAsReadUseCaseInput): Promise<void> {
        const updated = await this.notificationRepository.markAsRead(
            input.notificationId,
            input.userId,
        );

        if (!updated) {
            throw new NotFoundError("Notification not found.");
        }
    }
}
