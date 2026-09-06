export interface SuggestedUserItem {
    userId: string;
    username: string;
    fullName: string;
    avatarUrl: string;

    /** Whether the account carries the paid verification badge */
    isVerified: boolean;
    bannerUrl: string;
    bio: string | null;
    followersCount: number;
    isFollowing: false;
    isMe: false;
}
