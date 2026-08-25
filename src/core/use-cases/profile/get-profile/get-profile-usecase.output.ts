import type { Profile } from "@core/domain/entities/profile.entity";

export interface GetProfileOutput {
    profile: Profile;
    isMe: boolean;
    isFollowing: boolean;
    postCount: number;

    /** Published articles written by this user; drafts are never counted */
    articleCount: number;
}
