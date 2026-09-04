import type { UserProps } from "@core/domain/interfaces/user-props.interface";
import { PostType } from "@core/domain/enums";

/**
 * Rich domain model for User entity
 *
 * Encapsulates both data and business logic related to user accounts.
 * Users are the primary entities in the system with authentication,
 * authorization, and profile management capabilities.
 *
 * This entity follows domain-driven design principles by encapsulating
 * business logic and validation within the entity itself.
 */
export class User {
    private constructor(private readonly props: UserProps) {}

    public static create(
        email: string,
        username: string,
        passwordHash: string | null,
    ): User {
        return new User({
            email,
            username,
            passwordHash,
            isEmailVerified: false,
            isBot: false,
            deletedAt: null,
            bannedAt: null,
            digestOptOutAt: null,
        });
    }

    public static with(props: UserProps): User {
        return new User(props);
    }

    /**
     * Get the unique identifier for the user
     * @returns The user ID
     */
    get id(): string {
        return this.props.id!;
    }

    /**
     * Get the email address of the user
     * @returns The user's email address
     */
    get email(): string {
        return this.props.email;
    }

    /**
     * Get the username chosen by the user
     * @returns The user's username
     */
    get username(): string {
        return this.props.username;
    }

    /**
     * Get the hashed password for authentication
     * @returns The password hash or null for OAuth users
     */
    get passwordHash(): string | null {
        return this.props.passwordHash;
    }
    /**
     * Get the flag indicating if the user is a bot account
     * @returns True if the user is a bot, false otherwise
     */
    get isBot(): boolean {
        return this.props.isBot ?? false;
    }

    /**
     * Get the timestamp when the user account was soft-deleted
     * @returns The deletion timestamp or null if not deleted
     */
    get deletedAt(): Date | null {
        return this.props.deletedAt;
    }

    /**
     * Get the timestamp when the account was suspended
     * @returns The ban timestamp, or null while the account is in good standing
     */
    get bannedAt(): Date | null {
        return this.props.bannedAt;
    }

    /**
     * Get the creation timestamp of the user account
     * @returns The creation date
     */
    get createdAt(): Date {
        return this.props.createdAt!;
    }

    /**
     * Get the last update timestamp of the user account
     * @returns The last update date
     */
    get updatedAt(): Date {
        return this.props.updatedAt!;
    }

    /**
     * Check if the user account has been soft-deleted
     * @returns True if the user has been deleted, false otherwise
     */
    public isDeleted(): boolean {
        return this.props.deletedAt !== null;
    }

    /**
     * Check if the account has been suspended
     *
     * Independent of deletion: an account can be both, and a ban is what the
     * auth path reports first, so a suspended account is never handed the
     * recovery token that a pending deletion would earn it.
     *
     * @returns True if the account is banned, false otherwise
     */
    public isBanned(): boolean {
        return this.props.bannedAt !== null;
    }

    /**
     * Get the timestamp when the user left the daily digest
     * @returns The opt-out timestamp, or null while they are subscribed
     */
    get digestOptOutAt(): Date | null {
        return this.props.digestOptOutAt;
    }

    /**
     * Check whether the user still wants the daily digest
     * @returns True while the user has not opted out
     */
    public isDigestSubscribed(): boolean {
        return this.props.digestOptOutAt === null;
    }

    /**
     * Check if the user has a password set (not an OAuth user)
     * @returns True if the user has a password, false for OAuth users
     */
    public hasPassword(): boolean {
        return this.props.passwordHash !== null;
    }

    /**
     * Set the hashed password for the user
     * @param newPasswordHash - The new password hash to set
     */
    public set hashPassword(newPasswordHash: string) {
        this.props.passwordHash = newPasswordHash;
    }

    /**
     * Soft-delete the user account
     * This method mutates the entity state to mark the user as deleted
     */
    public delete(): void {
        this.props.deletedAt = new Date();
        this.props.updatedAt = new Date();
    }

    /**
     * Check if the user's email has been verified
     * @returns True if the email is verified, false otherwise
     */
    get isEmailVerified(): boolean {
        return this.props.isEmailVerified;
    }

    /**
     * Restore a soft-deleted user account
     * This method mutates the entity state to restore the user
     */
    public restore(): void {
        this.props.deletedAt = null;
        this.props.updatedAt = new Date();
    }

    /**
     * Mark the user's email as verified
     * This method mutates the entity state to verify the email
     */
    verifyEmail(): void {
        this.props.isEmailVerified = true;
    }
    /**
     * Determine if the user can create a post of a given type based on their account type (bot or regular)
     * @param type - The type of post being created
     * @returns True if the user can create the post type, false otherwise
     */
    public canCreatePostType(type: PostType): boolean {
        const restricted = [PostType.SYSTEM_UPDATE, PostType.TECH_NEWS];
        if (restricted.includes(type)) return this.isBot;
        return true;
    }
}
