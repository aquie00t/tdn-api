/**
 * Repository interface for managing Follow relationships.
 * Following Clean Architecture principles, this interface defines the contract
 * for persisting and retrieving Follow domain entities without exposing
 * implementation details or DTOs.
 */
export interface IFollowRepository {
    /**
     * Checks if a user is following another user.
     * @param followerId - The ID of the user who might be following.
     * @param followingId - The ID of the user being followed.
     * @returns A boolean indicating if the follow relationship exists.
     */
    checkIsFollowing(followerId: string, followingId: string): Promise<boolean>;

    /**
     * Creates a follow relationship between two users, if it is not there yet.
     *
     * Idempotent, and it has to be: reading first and then writing leaves a
     * window in which two overlapping requests - a double tap, a retry - both
     * see no relationship and both insert, and the second one hits the
     * composite primary key.
     *
     * @param followerId - The ID of the user initiating the follow (Current User).
     * @param followingId - The ID of the user being followed (Target User).
     * @returns True when this call created the relationship, false when it
     * was already there.
     */
    followUser(followerId: string, followingId: string): Promise<boolean>;

    /**
     * Removes a follow relationship between two users, if it is still there.
     *
     * Idempotent for the same reason as {@link followUser}: two overlapping
     * unfollows must not turn into a missing-record failure.
     *
     * @param followerId - The ID of the user who is currently following.
     * @param followingId - The ID of the user being unfollowed.
     * @returns True when this call removed the relationship, false when there
     * was nothing to remove.
     */
    unfollowUser(followerId: string, followingId: string): Promise<boolean>;

    /**
     * Retrieves a paginated list of users who follow the target user.
     * @param targetId - The ID of the user whose followers are being retrieved.
     * @param limit - The maximum number of followers to retrieve.
     * @param offset - The number of followers to skip (for pagination).
     * @returns An array of user information for followers.
     */
    getFollowers(
        targetId: string,
        limit: number,
        offset: number,
    ): Promise<
        {
            userId: string;
            username: string;
            fullName: string;
            avatarUrl: string;

            /** Whether the account carries the paid verification badge */
            isVerified: boolean;
            bio: string | null;
        }[]
    >;

    /**
     * Retrieves a paginated list of users that the target user is following.
     * @param targetId - The ID of the user whose following list is being retrieved.
     * @param limit - The maximum number of following users to retrieve.
     * @param offset - The number of following users to skip (for pagination).
     * @returns An array of user information for following users.
     */
    getFollowing(
        targetId: string,
        limit: number,
        offset: number,
    ): Promise<
        {
            userId: string;
            username: string;
            fullName: string;
            avatarUrl: string;

            /** Whether the account carries the paid verification badge */
            isVerified: boolean;
            bio: string | null;
        }[]
    >;

    /**
     * Checks which users from a list are being followed by a specific user.
     * @param followerId - The ID of the user doing the following.
     * @param followingIds - An array of user IDs to check.
     * @returns An array of user IDs that are being followed.
     */
    checkIsFollowingBulk(
        followerId: string,
        followingIds: string[],
    ): Promise<string[]>;

    /**
     * Counts the total number of followers for a specific user.
     * @param userId - The ID of the user whose follower count is being retrieved.
     * @returns The total number of followers.
     */
    getFollowersCount(userId: string): Promise<number>;

    /**
     * Retrieves all user IDs that the given user is following.
     * @param followerId - The ID of the user whose following list is being retrieved.
     * @returns An array of user IDs that the follower is following.
     */
    getFollowingIds(followerId: string): Promise<string[]>;

    /**
     * Retrieves the IDs of every user following the given user.
     *
     * The mirror of {@link getFollowingIds}. Backs new-post fan-out, which
     * needs the recipient list and nothing else, so soft-deleted followers are
     * left out - a deleted account must not collect notifications.
     *
     * @param userId - The ID of the user whose followers are being retrieved.
     * @returns An array of user IDs that follow the given user.
     */
    getFollowerIds(userId: string): Promise<string[]>;
}
