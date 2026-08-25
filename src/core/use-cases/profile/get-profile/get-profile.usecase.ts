import { NotFoundError } from "@core/errors/common/not-found.error";
import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { GetProfileOutput } from "./get-profile-usecase.output";

/**
 * Use case for retrieving a user profile with follow status.
 *
 * This use case handles fetching a user's profile information along with
 * follow relationship status for the current user.
 */
export class GetProfileUseCase {
    /**
     * Creates a new instance of GetProfileUseCase.
     *
     * @param profileRepository - Repository for managing profile data
     * @param followUserRepository - Repository for managing follow relationships
     * @param postRepository - Repository used to count the user's posts
     * @param articleRepository - Repository used to count published articles
     */
    constructor(
        private readonly profileRepository: IProfileRepository,
        private readonly followUserRepository: IFollowRepository,
        private readonly postRepository: IPostRepository,
        private readonly articleRepository: IArticleRepository,
    ) {}

    /**
     * Executes the get profile process.
     *
     * @param username - The username of the profile to retrieve
     * @param currentUserId - Optional ID of the current user for follow status
     * @returns Promise<GetProfileOutput> Profile data with follow status
     *
     * @throws NotFoundError - When the profile is not found
     *
     * @remarks
     * This method retrieves the profile by username and determines if the
     * current user is viewing their own profile or following the target user.
     * If no current user is provided, follow status is set to false.
     */
    async execute(
        username: string,
        currentUserId?: string,
    ): Promise<GetProfileOutput> {
        const profile = await this.profileRepository.findByUsername(username);

        if (!profile) throw new NotFoundError("Profile not found.");

        const isMe = currentUserId ? profile.userId === currentUserId : false;

        // The article count is published-only and therefore identical for every
        // viewer, including the owner. A viewer-dependent number would be
        // unstable and would fork a code path that is otherwise the same for
        // everyone.
        const [isFollowing, postCount, articleCount] = await Promise.all([
            currentUserId && !isMe
                ? this.followUserRepository.checkIsFollowing(
                      currentUserId,
                      profile.userId,
                  )
                : Promise.resolve(false),
            this.postRepository.countByUserId(profile.userId),
            this.articleRepository.countPublishedByAuthorId(profile.userId),
        ]);

        return {
            profile,
            isMe,
            isFollowing,
            postCount,
            articleCount,
        };
    }
}
