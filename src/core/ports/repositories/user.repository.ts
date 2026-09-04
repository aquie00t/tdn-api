import type { User } from "@core/domain/entities/user.entity";
import type { MentionedUser } from "@core/domain/interfaces/mentioned-user.interface";

/**
 * Interface for User persistence operations.
 * Following Clean Architecture, this contract abstracts the underlying database technology (Prisma, MongoDB, etc.)
 * from the Domain Layer.
 */
export interface IUserRepository {
    /**
     * Persists a new user entity with standard password credentials.
     * @param data - Object containing email, username, and hashed password.
     * @returns The newly created User entity.
     */
    create(data: {
        email: string;
        username: string;
        passwordHash: string | null;
    }): Promise<User>;

    /**
     * Retrieves a user by either their email or username.
     * Useful for login scenarios where the identifier type is unknown.
     * @param identifier - The email address or username string.
     * @returns User entity if found, otherwise null.
     */
    findByIdentifier(identifier: string): Promise<User | null>;

    /**
     * Retrieves a user by their unique primary identifier (UUID).
     * @param id - The unique user ID.
     * @returns User entity if found, otherwise null.
     */
    findById(id: string): Promise<User | null>;

    /**
     * Synchronizes the state of a User domain entity with the persistence layer.
     * Should be called after modifying entity properties.
     * @param user - The User entity containing updated values.
     */
    update(user: User): Promise<void>;

    /**
     * Finds a user specifically by their registered email address.
     * @param email - Validated email string.
     * @returns User entity if found, otherwise null.
     */
    findByEmail(email: string): Promise<User | null>;

    /**
     * Marks a user as deleted without physical removal (Soft Delete).
     * Populates the 'deletedAt' field to prevent the user from appearing in standard queries.
     * @param id - The ID of the user to be deactivated.
     */
    softDeleteById(id: string): Promise<void>;

    /**
     * Reverses a soft-delete operation.
     * Clears the 'deletedAt' field, restoring the user's access to the system.
     * @param id - The ID of the user to be restored.
     */
    restoreById(id: string): Promise<void>;

    /**
     * Finds a user specifically by their unique username.
     * @param username - The username string.
     * @returns User entity if found, otherwise null.
     */
    findByUsername(username: string): Promise<User | null>;

    /**
     * Resolves a batch of handles into the accounts behind them.
     *
     * Matching ignores letter case, and deleted accounts are left out, so the
     * result is what a mention may legitimately point at. Handles that match
     * nothing are simply absent from the result rather than reported.
     *
     * @param usernames - The handles to look up, without a leading "@".
     * @returns The id and current username of every account that matched.
     */
    findManyByUsernames(usernames: string[]): Promise<MentionedUser[]>;

    /**
     * Registers a user originating from an external OAuth provider (Google, GitHub, etc.).
     * @param data - Social profile data including provider details.
     * @returns The newly created User entity.
     */
    createWithOAuth(data: {
        email: string;
        username: string;
        provider: string;
        providerAccountId: string;
        isEmailVerified?: boolean;
    }): Promise<User>;

    /**
     * Physically removes users whose soft-deletion grace period has expired.
     * This method performs a 'Hard Delete' for accounts marked for deletion older than the specified threshold.
     * @returns The count of successfully purged records.
     */
    deleteExpiredUser(): Promise<number>;
    /**
     * Retrieves only the hashed password of a specific user by their ID.
     * This method is optimized to fetch only the sensitive credential field.
     *
     * @param id - The unique identifier of the user.
     * @returns The hashed password string, or null if the user does not exist.
     */
    findPasswordById(id: string): Promise<string | null>;
    /**
     * Directly updates the hashed password for a specific user in the persistence layer.
     * This operation is optimized for credential rotation (change/reset) to ensure
     * security-sensitive fields are updated without affecting other profile data.
     *
     * @param id - The unique identifier (UUID) of the user.
     * @param hashedNewPassword - The newly generated and securely hashed password string.
     */
    updatePassword(id: string, hashedNewPassword: string): Promise<void>;
    /**
     * Updates the unique username of a specific user in the persistence layer.
     * This operation relies on the underlying database to enforce uniqueness constraints.
     * If a collision occurs, it should throw a domain-specific conflict error.
     *
     * @param id - The unique identifier (UUID) of the user.
     * @param username - The new, desired username string.
     * @throws {ConflictError} If the provided username is already in use by another account.
     */
    updateUsername(id: string, username: string): Promise<void>;
    /**
     * Updates the email address of a specific user and marks the new email as unverified.
     * This operation relies on the database to enforce uniqueness constraints.
     *
     * @param id - The unique identifier (UUID) of the user.
     * @param newEmail - The new, desired email address string.
     * @throws {ConflictError} If the provided email is already in use by another account.
     */
    updateEmail(id: string, newEmail: string): Promise<void>;
}
