/**
 * Input for the GetFollowersUseCase, containing the target user ID, the current user ID (if any), and pagination parameters.
 */
export interface GetFollowersUseCaseInput {
    /**
     * The username of the user whose followers are being retrieved.
     *
     * Resolved to a user id inside the use case. The controller used to do
     * this by loading the whole profile, which also computed post and article
     * counts that this endpoint never reads.
     */
    username: string;
    /**
     * The ID of the current user making the request. This is optional and is used to determine follow status for each follower. If provided, the response will indicate whether the current user follows each listed follower and whether any listed follower is the same as the current user.
     */
    currentUserId: string | undefined;
    /**
     * The maximum number of followers to return in the response. This is used for pagination and should be a positive integer. If not provided, a default value may be used by the implementation.
     */
    limit: number;
    /**
     * The number of followers to skip before starting to collect the result set. This is used for pagination and should be a non-negative integer. If not provided, it defaults to 0, meaning that the result will start from the first follower.
     */
    offset: number;
}
