import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import { NotFoundError } from "@core/errors";
import type { GetFollowingUseCaseOutput } from "./get-following-usecase.output";
import type { GetFollowingUseCaseInput } from "./get-following-usecase.input";

export class GetFollowingUseCase {
    /**
     * Creates a new instance of GetFollowingUseCase.
     *
     * @param followUserRepository - Repository for managing follow relationships
     * @param profileRepository - Repository used to resolve the username
     */
    constructor(
        private readonly followUserRepository: IFollowRepository,
        private readonly profileRepository: IProfileRepository,
    ) {}

    /**
     * Executes the get following use case.
     * @param input - The input data for the use case, including the target user's ID, the current user's ID, and pagination parameters.
     * @returns A promise that resolves to an array of following users, each containing user information and follow status.
     * The use case retrieves the list of users that the target user is following, checks if the current user follows each of those users, and returns an array of following users with their information and follow status relative to the current user.
     */
    async execute(
        input: GetFollowingUseCaseInput,
    ): Promise<GetFollowingUseCaseOutput[]> {
        const { username, currentUserId, limit, offset } = input;

        const profile = await this.profileRepository.findByUsername(username);

        // Same error the controller's profile lookup used to raise, so an
        // unknown username keeps answering 404 rather than an empty 200.
        if (!profile) throw new NotFoundError("Profile not found.");

        const following = await this.followUserRepository.getFollowing(
            profile.userId,
            limit,
            offset,
        );

        if (following.length === 0) return [];

        let followedIds = new Set<string>();

        if (currentUserId) {
            const listedUserIds = following.map((f) => f.userId);
            const followedArray =
                await this.followUserRepository.checkIsFollowingBulk(
                    currentUserId,
                    listedUserIds,
                );
            followedIds = new Set(followedArray);
        }

        return following.map((f) => ({
            ...f,
            isFollowing: currentUserId ? followedIds.has(f.userId) : false,
            isMe: currentUserId === f.userId,
        }));
    }
}
