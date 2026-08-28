import type { PostCategory } from "@core/domain/enums/post-category-enum";

/**
 * Input interface for updating a user's profile information.
 *
 * This interface defines the optional parameters for updating
 * various aspects of a user's profile.
 */
export interface UpdateProfileInput {
    /**
     * The unique identifier of the user whose profile is being updated.
     */
    userId: string;

    /**
     * The user's full name.
     * Optional - if provided, will update the user's display name.
     */
    fullName?: string;

    /**
     * The user's biography or short description.
     * Optional - can be null to clear the bio.
     */
    bio?: string | null;

    /**
     * The user's location or city.
     * Optional - can be null to clear the location.
     */
    location?: string | null;

    /**
     * The user's social media links.
     * Optional - object with platform names as keys and URLs as values.
     * Can be null to clear all social links.
     */
    socials?: Record<string, string> | null;

    /**
     * The discovery categories advertised by the profile.
     * Bot accounts only — a non-bot user sending this is rejected with a 403.
     * Optional - an empty array clears every category.
     */
    categories?: PostCategory[];
}
