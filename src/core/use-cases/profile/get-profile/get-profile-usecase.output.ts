import type { Profile } from "@core/domain/entities/profile.entity";

export interface GetProfileOutput {
    profile: Profile;
    isMe: boolean;
    isFollowing: boolean;
    postCount: number;

    /** Published articles written by this user; drafts are never counted */
    articleCount: number;

    /** The viewer has blocked this account, and can lift it from here */
    isBlocked: boolean;

    /**
     * This account has blocked the viewer.
     *
     * Reported rather than hidden. The alternative - answering 404 - leaves
     * the blocked user unable to tell a block from a deleted account, so they
     * assume something is broken and keep trying; a client that knows can say
     * plainly what happened and stop.
     */
    isBlockedBy: boolean;
}
