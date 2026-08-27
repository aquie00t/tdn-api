import { ForbiddenError } from "@core/errors";
import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { UpdateProfileInput } from "./update-profile-usecase.input";

/**
 * Use case for updating a user's profile information.
 *
 * This use case handles updating various profile fields such as full name,
 * bio, location, and social media links for a specific user.
 */
export class UpdateProfileUseCase {
    /**
     * Creates a new instance of UpdateProfileUseCase.
     *
     * @param profileRepository - Repository for managing profile data
     * @param userRepository - Repository used to verify bot-only fields
     */
    constructor(
        private readonly profileRepository: IProfileRepository,
        private readonly userRepository: IUserRepository,
    ) {}

    /**
     * Executes the profile update process.
     *
     * @param input - Input containing user ID and optional profile fields to update
     * @returns Promise<void> - Resolves when profile update is complete
     *
     * @remarks
     * This method updates the user's profile with the provided fields.
     * Only the fields that are provided will be updated, leaving other
     * fields unchanged. The update is performed directly on the repository.
     *
     * Categories are a bot-only field: when they are present in the input the
     * user is loaded and rejected unless the account is flagged as a bot.
     *
     * @throws {ForbiddenError} When a non-bot account tries to set categories.
     */
    async execute(input: UpdateProfileInput): Promise<void> {
        if (input.categories !== undefined) {
            const user = await this.userRepository.findById(input.userId);

            if (!user?.isBot) {
                throw new ForbiddenError(
                    "Only bot accounts can set profile categories.",
                );
            }
        }

        await this.profileRepository.update(input.userId, input);
    }
}
