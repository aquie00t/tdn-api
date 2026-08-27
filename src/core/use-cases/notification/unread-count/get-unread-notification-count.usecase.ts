import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import type { GetUnreadNotificationCountInput } from "./get-unread-notification-count-usecase.input";

/**
 * Use case for reading how many notifications a user has not read yet.
 *
 * Backs the unread badge, which would otherwise force the client to page
 * through the whole list and count client-side.
 */
export class GetUnreadNotificationCountUseCase {
    /**
     * Creates a new instance of GetUnreadNotificationCountUseCase.
     *
     * @param notificationRepository - Repository for managing notifications
     */
    constructor(
        private readonly notificationRepository: INotificationRepository,
    ) {}

    /**
     * Executes the unread count lookup.
     *
     * @param input - The input containing the ID of the user to count for
     * @returns Promise<number> The number of unread notifications
     */
    async execute(input: GetUnreadNotificationCountInput): Promise<number> {
        return await this.notificationRepository.getUnreadCount(input.userId);
    }
}
