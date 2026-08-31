import type { PostCategory } from "@core/domain/enums/post-category-enum";

/**
 * Props interface for Profile entity
 *
 * Represents the properties required to create or update a user profile.
 * Profiles contain additional user information beyond basic account details,
 * including personal information, social media links, and display preferences.
 */
export interface ProfileProps {
    /** Unique identifier for the profile */
    id?: string;

    /** The unique identifier of the associated user */
    userId: string;

    /** The full name of the user */
    fullName: string;

    /** Optional biography or description of the user */
    bio: string | null;

    /** Optional location information for the user */
    location: string | null;

    /** URL to the user's profile avatar image */
    avatarUrl: string;

    /** URL to the user's profile banner image */
    bannerUrl: string;

    /** Optional social media links object (key-value pairs of platform and URL) */
    socials: Record<string, string> | null;

    /**
     * Discovery categories for the profile.
     * Only bot accounts populate this — human profiles keep an empty array.
     */
    categories: PostCategory[];

    /**
     * BCP-47 language codes the user wants their feed in, most preferred first.
     *
     * Empty means the user never chose, which is not the same as wanting no
     * language: the feed falls back to the request's Accept-Language and then
     * to the platform default.
     */
    languages: string[];

    /** Creation timestamp of the profile */
    createdAt?: Date;

    /** Last update timestamp of the profile */
    updatedAt?: Date;

    /**
     * User Props
     *
     * Additional user-related properties that may be included
     * with profile data for convenience in certain operations.
     */

    /** The username of the associated user */
    username: string;

    /** Number of users following this profile */
    followersCount: number;

    /** Number of users this profile is following */
    followingCount: number;
}
