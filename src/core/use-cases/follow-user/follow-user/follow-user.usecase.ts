import { BadRequestError, NotFoundError } from "@core/errors";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import { Notification } from "@core/domain/entities/notification.entity";
import { NotificationType } from "@core/domain/enums/notification-type.enum";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import type { FollowUserUseCaseInput } from "./follow-user-usecase.input";
import type { FollowUserUseCaseOutput } from "./follow-user-usecase.output";

/**
 * Use case for following another user.
 *
 * This use case handles the process of following a user, creating a notification
 * for the target user, and emitting a real-time event.
 */
export class FollowUserUseCase {
    /**
     * Creates a new instance of FollowUserUseCase.
     *
     * @param followUserRepository - Repository for managing follow relationships
     * @param notificationRepository - Repository for managing notifications
     * @param realtimeService - Service for real-time communication
     */
    constructor(
        private readonly followUserRepository: IFollowRepository,
        private readonly notificationRepository: INotificationRepository,
        private readonly realtimeService: RealtimePort,
        private readonly profileRepository: IProfileRepository,
    ) {}

    /**
     * Executes the follow user use case.
     * @param input - The input data for the use case, including the current user's ID and the target user's ID.
     * @returns A promise that resolves to the output of the use case, which includes the updated followers count for the target user.
     * @throws {BadRequestError} If the current user tries to follow themselves.
     * @throws {Error} If any other error occurs during the follow operation.
     */
    async execute(
        input: FollowUserUseCaseInput,
    ): Promise<FollowUserUseCaseOutput> {
        const { currentUserId, targetId } = input;

        if (currentUserId === targetId)
            throw new BadRequestError("You cannot follow yourself.");

        const targetProfile =
            await this.profileRepository.findByUserId(targetId);
        if (!targetProfile) throw new NotFoundError("User not found.");

        // The write decides, not a preceding read: asking first and inserting
        // afterwards let two overlapping requests both find nothing and both
        // insert, and the loser died on the composite primary key. The count
        // it returns is also the exact answer to "should this notify?".
        const created = await this.followUserRepository.followUser(
            currentUserId,
            targetId,
        );

        if (created) {
            const notification = Notification.create(
                targetId,
                currentUserId,
                NotificationType.FOLLOW,
            );

            await this.notificationRepository.create(notification);

            this.realtimeService.emitToUser(targetId, "new-notification", {
                type: NotificationType.FOLLOW,
                issuerId: currentUserId,
            });
        }

        const followersCount =
            await this.followUserRepository.getFollowersCount(targetId);
        return { followersCount };
    }
}
