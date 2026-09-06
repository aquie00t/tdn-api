/**
 * Output DTO for the GetFollowingUseCase, representing the data returned for each following user.
 */
export interface GetFollowingUseCaseOutput {
    /**
     * The unique identifier of the following user.
     */
    userId: string;
    /**
     * The username of the following user, used for display and mentions. It is unique across the platform.
     */
    username: string;
    /**
     * The full name of the following user, which may include their first and last name. This is used for display purposes and is not necessarily unique.
     */
    fullName: string;
    /**
     * The URL of the following user's avatar image. This is used for display purposes in the following list. It may be a default avatar if the user has not set one.
     */
    avatarUrl: string;

    /** Whether the account carries the paid verification badge */
    isVerified: boolean;
    /**
     * The bio of the following user, which is a short description they can set on their profile. This may be null if the user has not provided a bio. It is used for display purposes in the following list.
     */
    bio: string | null;
    /**
     * Indicates whether the current user is following this following user. This field is true if the current user follows the listed following user, and false otherwise. It is used to show follow status in the following list and to determine if a "Follow" or "Unfollow" button should be displayed.
     */
    isFollowing: boolean;
    /**
     * Indicates whether the listed following user is the same as the current user. This field is true if the following user's userId matches the currentUserId, and false otherwise. It is used to prevent showing follow/unfollow options for oneself in the following list.
     */
    isMe: boolean;
}
