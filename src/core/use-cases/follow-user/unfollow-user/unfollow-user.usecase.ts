import { BadRequestError, NotFoundError } from "@core/errors";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import { NotificationType } from "@core/domain/enums/notification-type.enum";
import type { UnFollowUserUseCaseInput, UnFollowUserUseCaseOutput } from "./";

/**
 * Use case for unfollowing another user.
 *
 * This use case handles the process of removing a follow relationship
 * between two users.
 */
export class UnfollowUserUseCase {
    /**
     * Creates a new instance of UnfollowUserUseCase.
     *
     * @param followUserRepository - Repository for managing follow relationships
     * @param profileRepository - Repository for managing user profiles
     * @param notificationRepository - Repository for managing notifications
     */
    constructor(
        private readonly followUserRepository: IFollowRepository,
        private readonly profileRepository: IProfileRepository,
        private readonly notificationRepository: INotificationRepository,
    ) {}

    /**
     * Executes the unfollow user use case.
     * @param input - The input data required to perform the unfollow action, including the current user's ID and the target user's ID.
     * @returns A promise that resolves to the output of the unfollow action, which includes the updated followers count for the target user.
     * @throws NotFoundError if the target user does not exist.
     * @throws BadRequestError if the current user attempts to unfollow themselves.
     */
    async execute(
        input: UnFollowUserUseCaseInput,
    ): Promise<UnFollowUserUseCaseOutput> {
        const { currentUserId, targetId } = input;

        const targetProfile =
            await this.profileRepository.findByUserId(targetId);
        if (!targetProfile) throw new NotFoundError("User not found.");

        if (currentUserId === targetProfile.userId) {
            throw new BadRequestError("You cannot unfollow yourself.");
        }

        // Same as following: the delete itself reports whether there was
        // anything to remove, so two overlapping unfollows cannot turn into a
        // missing-record failure.
        const removed = await this.followUserRepository.unfollowUser(
            currentUserId,
            targetProfile.userId,
        );

        if (removed) {
            // The follow notification goes with the follow: leaving it behind
            // tells the target someone follows them who no longer does, and
            // re-following would stack a second one on top.
            await this.notificationRepository.deleteByTarget({
                recipientId: targetProfile.userId,
                issuerId: currentUserId,
                type: NotificationType.FOLLOW,
            });
        }

        const followersCount =
            await this.followUserRepository.getFollowersCount(
                targetProfile.userId,
            );
        return { followersCount };
    }
}
