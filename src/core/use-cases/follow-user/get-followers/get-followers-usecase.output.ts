/**
 * Output DTO for the GetFollowersUseCase, representing the data returned for each follower.
 */
export interface GetFollowersUseCaseOutput {
    /**
     * The unique identifier of the follower user.
     */
    userId: string;
    /**
     * The username of the follower user, used for display and mentions. It is unique across the platform.
     */
    username: string;
    /**
     * The full name of the follower user, which may include their first and last name. This is used for display purposes and is not necessarily unique.
     */
    fullName: string;
    /**
     * The URL of the follower user's avatar image. This is used for display purposes in the followers list. It may be a default avatar if the user has not set one.
     */
    avatarUrl: string;

    /** Whether the account carries the paid verification badge */
    isVerified: boolean;
    /**
     * The bio of the follower user, which is a short description they can set on their profile. This may be null if the user has not provided a bio. It is used for display purposes in the followers list.
     */
    bio: string | null;
    /**
     * Indicates whether the current user is following this follower. This field is true if the current user follows the listed follower, and false otherwise. It is used to show follow status in the followers list and to determine if a "Follow" or "Unfollow" button should be displayed.
     */
    isFollowing: boolean;
    /**
     * Indicates whether the listed follower is the same as the current user. This field is true if the follower's userId matches the currentUserId, and false otherwise. It is used to prevent showing follow/unfollow options for oneself in the followers list.
     */
    isMe: boolean;
}
