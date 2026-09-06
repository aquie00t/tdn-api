import type { PostCategory } from "@core/domain/enums/post-category-enum";
import type { ProfileProps } from "@core/domain/interfaces/profile-props.interface";

/**
 * Rich domain model for Profile entity
 *
 * Encapsulates both data and business logic related to user profiles.
 * Profiles contain additional user information beyond basic account details,
 * including personal information, social media links, and display preferences.
 *
 * This entity follows domain-driven design principles by encapsulating
 * business logic and validation within the entity itself.
 */
export class Profile {
    private constructor(private readonly props: ProfileProps) {}

    public static create(
        userId: string,
        username: string,
        fullName: string,
        avatarUrl: string,
        bannerUrl: string,
    ): Profile {
        return new Profile({
            userId,
            username,
            fullName,
            avatarUrl,
            bannerUrl,
            bio: null,
            location: null,
            socials: null,
            categories: [],
            languages: [],
            followersCount: 0,
            followingCount: 0,
        });
    }

    public static with(props: ProfileProps): Profile {
        return new Profile(props);
    }

    /**
     * Get the unique identifier for the profile
     * @returns The profile ID
     */
    get id(): string {
        return this.props.id!;
    }

    /**
     * Get the unique identifier of the associated user
     * @returns The user ID
     */
    get userId(): string {
        return this.props.userId;
    }

    /**
     * Get the full name of the user
     * @returns The user's full name
     */
    get fullName(): string {
        return this.props.fullName;
    }

    /**
     * Get the biography or description of the user
     * @returns The user's bio or null if not set
     */
    get bio(): string | null {
        return this.props.bio;
    }

    /**
     * Get the location information for the user
     * @returns The user's location or null if not set
     */
    get location(): string | null {
        return this.props.location;
    }

    /**
     * Get the URL to the user's profile avatar image
     * @returns The avatar image URL
     */
    get avatarUrl(): string {
        return this.props.avatarUrl;
    }

    /**
     * Get the URL to the user's profile banner image
     * @returns The banner image URL
     */
    get bannerUrl(): string {
        return this.props.bannerUrl;
    }

    /**
     * Get the social media links object
     * @returns Object containing platform-URL key-value pairs, or empty object if null
     */
    get socials(): Record<string, string> {
        return this.props.socials || {};
    }

    /**
     * Get the discovery categories of the profile
     * @returns The categories, empty for non-bot profiles
     */
    get categories(): PostCategory[] {
        return this.props.categories ?? [];
    }

    /**
     * Get the feed languages the user chose
     * @returns The language codes, empty when the user never chose
     */
    get languages(): string[] {
        return this.props.languages ?? [];
    }

    /**
     * Get the creation timestamp of the profile
     * @returns The creation date
     */
    get createdAt(): Date {
        return this.props.createdAt!;
    }

    /**
     * Get the last update timestamp of the profile
     * @returns The last update date
     */
    get updatedAt(): Date {
        return this.props.updatedAt!;
    }

    /**
     * Get the username of the associated user
     * @returns The username
     */
    get username(): string {
        return this.props.username;
    }

    /**
     * Whether the account carries the paid verification badge
     * @returns True while the badge is granted
     */
    get isVerified(): boolean {
        return this.props.isVerified ?? false;
    }

    /**
     * Get the number of users following this profile
     * @returns The followers count
     */
    get followersCount(): number {
        return this.props.followersCount;
    }

    /**
     * Get the number of users this profile is following
     * @returns The following count
     */
    get followingCount(): number {
        return this.props.followingCount;
    }

    /**
     * Update the profile with new data
     * This method mutates the entity state to update profile information
     * @param data - Partial object containing the fields to update
     */
    public update(
        data: Partial<
            Pick<
                ProfileProps,
                "fullName" | "bio" | "location" | "socials" | "categories"
            >
        >,
    ): void {
        Object.assign(this.props, {
            ...data,
            updatedAt: new Date(),
        });
    }
}
