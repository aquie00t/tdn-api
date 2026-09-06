import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import type { GetSuggestedUsersInput } from "./get-suggested-users.input";
import type { SuggestedUserItem } from "./get-suggested-users.output";

const DEFAULT_LIMIT = 10;

export class GetSuggestedUsersUseCase {
    constructor(private readonly profileRepository: IProfileRepository) {}

    async execute(input: GetSuggestedUsersInput): Promise<SuggestedUserItem[]> {
        const limit = input.limit ?? DEFAULT_LIMIT;
        const currentUserId = input.currentUserId ?? null;

        const profiles = await this.profileRepository.getSuggestedUsers(
            currentUserId,
            limit,
        );

        return profiles.map((profile) => ({
            userId: profile.userId,
            username: profile.username,
            fullName: profile.fullName,
            avatarUrl: profile.avatarUrl,
            isVerified: profile.isVerified,
            bannerUrl: profile.bannerUrl,
            bio: profile.bio,
            followersCount: profile.followersCount,
            isFollowing: false as const,
            isMe: false as const,
        }));
    }
}
