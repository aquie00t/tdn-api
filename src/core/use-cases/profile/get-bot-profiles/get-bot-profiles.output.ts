import type { PostCategory } from "@core/domain/enums/post-category-enum";

/**
 * A single bot profile returned by the GetBotProfilesUseCase.
 */
export interface BotProfileItem {
    /** The unique identifier of the bot user. */
    userId: string;

    /** The unique handle of the bot. */
    username: string;

    /** The display name of the bot. */
    fullName: string;

    /** Storage path or URL of the bot's avatar image. */
    avatarUrl: string;

    /** Whether the account carries the paid verification badge */
    isVerified: boolean;

    /** Storage path or URL of the bot's banner image. */
    bannerUrl: string;

    /** Short description of the bot, or null when unset. */
    bio: string | null;

    /** The categories this bot publishes for. */
    categories: PostCategory[];

    /** Number of users following this bot. */
    followersCount: number;

    /** Whether the requesting user already follows this bot. */
    isFollowing: boolean;
}
