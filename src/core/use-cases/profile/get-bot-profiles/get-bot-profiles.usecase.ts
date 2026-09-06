import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import type { GetBotProfilesInput } from "./get-bot-profiles.input";
import type { BotProfileItem } from "./get-bot-profiles.output";

const DEFAULT_LIMIT = 20;
const DEFAULT_OFFSET = 0;

/**
 * Use case for listing bot accounts, optionally narrowed to a set of categories.
 *
 * Backs the onboarding step where a user picks their fields of interest and
 * follows the matching news bots. Human accounts are never part of the result:
 * the repository pins the query to bots.
 */
export class GetBotProfilesUseCase {
    /**
     * Creates a new instance of GetBotProfilesUseCase.
     *
     * @param profileRepository - Repository for reading bot profiles
     * @param followUserRepository - Repository used to resolve follow state
     */
    constructor(
        private readonly profileRepository: IProfileRepository,
        private readonly followUserRepository: IFollowRepository,
    ) {}

    /**
     * Executes the bot listing query.
     *
     * @param input - Categories, pagination, and the optional current user ID
     * @returns Promise<BotProfileItem[]> Bots ordered by follower count
     *
     * @remarks
     * When the caller is authenticated the already-followed bots are flagged in
     * a single bulk lookup so the client can render the onboarding checklist.
     */
    async execute(input: GetBotProfilesInput): Promise<BotProfileItem[]> {
        const limit = input.limit ?? DEFAULT_LIMIT;
        const offset = input.offset ?? DEFAULT_OFFSET;

        const profiles = await this.profileRepository.findBotProfiles(
            input.categories,
            limit,
            offset,
        );

        if (profiles.length === 0) return [];

        const followedIds = input.currentUserId
            ? new Set(
                  await this.followUserRepository.checkIsFollowingBulk(
                      input.currentUserId,
                      profiles.map((profile) => profile.userId),
                  ),
              )
            : new Set<string>();

        return profiles.map((profile) => ({
            userId: profile.userId,
            username: profile.username,
            fullName: profile.fullName,
            avatarUrl: profile.avatarUrl,
            isVerified: profile.isVerified,
            bannerUrl: profile.bannerUrl,
            bio: profile.bio,
            categories: profile.categories,
            followersCount: profile.followersCount,
            isFollowing: followedIds.has(profile.userId),
        }));
    }
}
