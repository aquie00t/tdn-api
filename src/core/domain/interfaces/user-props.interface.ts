/**
 * Props interface for User entity
 *
 * Represents the properties required to create or update a user account.
 * Users are the primary entities in the system with authentication,
 * authorization, and profile management capabilities.
 */
export interface UserProps {
    /** Unique identifier for the user */
    id?: string;

    /** Email address of the user (must be unique) */
    email: string;

    /** Username chosen by the user (must be unique) */
    username: string;

    /** Hashed password for authentication (null for OAuth users) */
    passwordHash: string | null;

    /** Boolean flag indicating whether the user's email has been verified */
    isEmailVerified: boolean;

    /** Optional boolean flag indicating whether the user is a bot account */
    isBot?: boolean;

    /** Optional timestamp when the user account was soft-deleted */
    deletedAt: Date | null;

    /**
     * When the account was suspended, or null while it is in good standing.
     *
     * Set by hand against the database; nothing in the application writes it.
     */
    bannedAt: Date | null;

    /**
     * When the user opted out of the daily digest, or null while subscribed.
     */
    digestOptOutAt: Date | null;

    /** Creation timestamp of the user account */
    createdAt?: Date;

    /** Last update timestamp of the user account */
    updatedAt?: Date;
}
