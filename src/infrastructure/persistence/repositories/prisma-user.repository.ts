import type { User } from "@core/domain/entities/user.entity";
import type { MentionedUser } from "@core/domain/interfaces/mentioned-user.interface";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import { UserPrismaMapper } from "@infrastructure/persistence/mappers/user-prisma.mapper";
import {
    ConflictError,
    UserAlreadyExistsError,
    type CustomError,
} from "@core/errors";
import { Prisma } from "@generated/prisma/client";
import type { PrismaTransactionalClient } from "@infrastructure/persistence/database/prisma-client.type";

/**
 * PrismaUserRepository is a concrete implementation of the IUserRepository interface using Prisma as the ORM for database interactions.
 * This repository provides methods for creating, retrieving, updating, and deleting user records in the database.
 * It also includes functionality for handling soft deletes and retrieving followers of a user.
 */
export interface PrismaUserRepositoryOptions {
    /**
     * The number of days to retain soft-deleted user records before they are permanently removed from the database.
     */
    gracePeriodDays: number;
}

export class PrismaUserRepository implements IUserRepository {
    /**
     * Creates a new instance of PrismaUserRepository.
     * @param prisma - An instance of PrismaTransactionalClient for database operations.
     * @param options - Configuration options for the repository, including the grace period for soft-deleted users.
     */
    constructor(
        private readonly prisma: PrismaTransactionalClient,
        private readonly options: PrismaUserRepositoryOptions,
    ) {}
    /**
     * Persists a new user entity with standard password credentials.
     * This method attempts to create a new user record in the database using the provided email, username, and hashed password.
     * It also creates an associated profile record with the user's full name set to their username.
     * The method handles potential uniqueness violations by catching specific Prisma errors and throwing a more domain-specific UserAlreadyExistsError when a duplicate email or username is detected.
     * @param data - Object containing email, username, and hashed password.
     * @returns The newly created User entity.
     * @throws {UserAlreadyExistsError} If a user with the same email or username already exists in the database.
     */
    async create(data: {
        email: string;
        username: string;
        passwordHash: string | null;
    }): Promise<User> {
        try {
            const user = await this.prisma.user.create({
                data: {
                    ...UserPrismaMapper.toPrismaCreateUser(data),

                    profile: {
                        create: {
                            fullName: data.username,
                        },
                    },
                },
            });

            return UserPrismaMapper.toDomainUser(user);
        } catch (error: unknown) {
            this.handleP2002(error, new UserAlreadyExistsError());
        }
    }
    /**
     * This method is essential for login scenarios where the identifier type (email or username) is unknown.
     * It attempts to find a user by either their email address or username, allowing for flexible authentication flows.
     * @param identifier - The email address or username string used to identify the user.
     * @returns User entity if found, otherwise null.
     */
    async createWithOAuth(data: {
        email: string;
        username: string;
        provider: string;
        providerAccountId: string;
        isEmailVerified: boolean;
    }): Promise<User> {
        try {
            const user = await this.prisma.user.create({
                data: {
                    email: data.email,
                    username: data.username,
                    password: null,
                    isEmailVerified: data.isEmailVerified,
                    oauthAccounts: {
                        create: {
                            provider: data.provider,
                            providerAccountId: data.providerAccountId,
                        },
                    },
                    profile: {
                        create: {
                            fullName: data.username,
                        },
                    },
                },
            });

            return UserPrismaMapper.toDomainUser(user);
        } catch (error: unknown) {
            this.handleP2002(error, new UserAlreadyExistsError());
        }
    }
    /**
     * This method is useful for login scenarios where the identifier type (email or username) is unknown.
     * It attempts to find a user by either their email address or username, allowing for flexible authentication flows.
     * @param identifier - The email address or username string used to identify the user.
     * @returns User entity if found, otherwise null.
     */
    async findByIdentifier(identifier: string): Promise<User | null> {
        const user = await this.prisma.user.findFirst({
            where: {
                OR: [{ email: identifier }, { username: identifier }],
            },
        });

        if (!user) return null;

        return UserPrismaMapper.toDomainUser(user);
    }
    /**
     * Retrieves a user by their unique primary identifier (UUID).
     * @param id - The unique user ID.
     * @returns User entity if found, otherwise null.
     */
    async findById(id: string): Promise<User | null> {
        const rawUser = await this.prisma.user.findFirst({
            where: { id },
        });

        if (!rawUser) return null;

        return UserPrismaMapper.toDomainUser(rawUser);
    }
    /**
     * Synchronizes the state of a User domain entity with the persistence layer.
     * Should be called after modifying entity properties.
     * @param user - The User entity containing updated values.
     * @return void
     */
    async update(user: User): Promise<void> {
        await this.prisma.user.update({
            where: {
                id: user.id,
            },
            data: {
                email: user.email,
                username: user.username,
                password: user.passwordHash,
                isEmailVerified: user.isEmailVerified,
                deletedAt: user.deletedAt,
            },
        });
    }
    /**
     * Finds a user specifically by their registered email address.
     * @param email - Validated email string.
     * @returns User entity if found, otherwise null.
     */
    async findByEmail(email: string): Promise<User | null> {
        const rawUser = await this.prisma.user.findFirst({ where: { email } });

        if (!rawUser) return null;

        return UserPrismaMapper.toDomainUser(rawUser);
    }
    /**
     * Marks a user as deleted without physical removal (Soft Delete).
     * Populates the 'deletedAt' field to prevent the user from appearing in standard queries.
     * @param id - The ID of the user to be deactivated.
     * @returns void
     */
    async softDeleteById(id: string): Promise<void> {
        await this.prisma.user.update({
            where: {
                id,
            },
            data: {
                deletedAt: new Date(),
            },
        });
    }
    /**
     * Reverses a soft-delete operation.
     * Clears the 'deletedAt' field, restoring the user's access to the system.
     * @param id - The ID of the user to be restored.
     * @returns void
     */
    async restoreById(id: string): Promise<void> {
        await this.prisma.user.update({
            where: { id },
            data: {
                deletedAt: null,
            },
        });
    }
    /**
     * Finds a user specifically by their unique username.
     * @param username - The username string.
     * @returns User entity if found, otherwise null.
     */
    async findByUsername(username: string): Promise<User | null> {
        const user = await this.prisma.user.findUnique({ where: { username } });

        if (!user) return null;

        return UserPrismaMapper.toDomainUser(user);
    }

    /**
     * Resolves a batch of handles into the accounts behind them.
     *
     * Done in two passes on purpose. `username` carries a plain unique btree
     * index and Postgres compares text case-sensitively, so an exact `in`
     * lookup is index-backed and answers everything a client typed through
     * autocomplete - which is nearly every mention. Only the leftovers fall
     * through to `mode: "insensitive"`, which compiles to ILIKE and cannot use
     * that index; the mention limit caps that second query at ten predicates.
     *
     * @param usernames - The handles to look up, without a leading "@".
     * @returns The id and current username of every account that matched.
     */
    async findManyByUsernames(usernames: string[]): Promise<MentionedUser[]> {
        if (usernames.length === 0) return [];

        const selection = { id: true, username: true } as const;

        const exact = await this.prisma.user.findMany({
            where: { username: { in: usernames }, deletedAt: null },
            select: selection,
        });

        const matched = new Set(exact.map((user) => user.username));
        const unmatched = usernames.filter((name) => !matched.has(name));

        if (unmatched.length === 0) return exact;

        const insensitive = await this.prisma.user.findMany({
            where: {
                deletedAt: null,
                OR: unmatched.map((name) => ({
                    username: { equals: name, mode: "insensitive" as const },
                })),
            },
            select: selection,
        });

        return [...exact, ...insensitive];
    }
    /**
     * Deletes users who have been marked as deleted for longer than the configured grace period.
     * This method performs a hard delete on accounts that have exceeded the soft deletion threshold.
     * It calculates the cutoff date based on the current date minus the grace period and deletes all users
     * whose 'deletedAt' timestamp is older than this cutoff. The method returns the count of deleted records.
     *
     * @returns The number of user records that were permanently deleted from the database.
     */
    async deleteExpiredUser(): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.options.gracePeriodDays);

        const result = await this.prisma.user.deleteMany({
            where: {
                deletedAt: {
                    not: null,
                    lte: cutoffDate,
                },
            },
        });
        return result.count;
    }
    /**
     * Retrieves the hashed password for a user by their unique identifier (ID).
     * This method is used in authentication processes where the system needs to verify a user's credentials.
     * It returns the hashed password string if the user exists, or null if the user is not found.
     * @param id - The unique identifier (UUID) of the user whose password is to be retrieved.
     * @return The hashed password string if the user exists, otherwise null.
     */
    async findPasswordById(id: string): Promise<string | null> {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: { password: true },
        });

        return user?.password ?? null;
    }
    /**
     * Updates the username of a specific user in the persistence layer.
     * This method attempts to update the username and relies on the database's unique constraint to prevent duplicates.
     * If a conflict occurs (i.e., the new username is already taken), it catches the specific Prisma error and throws a more user-friendly ConflictError.
     * @param id - The unique identifier (UUID) of the user whose username is to be updated.
     * @param username - The new username string that the user wants to adopt.
     * @throws {ConflictError} If the provided username is already in use by another account, indicating a uniqueness violation.
     */
    async updatePassword(id: string, hashedNewPassword: string): Promise<void> {
        await this.prisma.user.update({
            where: { id },
            data: {
                password: hashedNewPassword,
            },
        });
    }

    /**
     * Updates the username of a specific user in the persistence layer.
     * This method attempts to update the username and relies on the database's unique constraint to prevent duplicates.
     * If a conflict occurs (i.e., the new username is already taken), it catches the specific Prisma error and throws a more user-friendly ConflictError.
     * @param id - The unique identifier (UUID) of the user whose username is to be updated.
     * @param username - The new username string that the user wants to adopt.
     * @throws {ConflictError} If the provided username is already in use by another account, indicating a uniqueness violation.
     */
    async updateUsername(id: string, username: string): Promise<void> {
        try {
            await this.prisma.user.update({
                where: { id },
                data: { username },
            });
        } catch (error: unknown) {
            this.handleP2002(
                error,
                new ConflictError(
                    "This username is already taken. Please choose another one.",
                ),
            );
        }
    }

    /**
     * Updates the email address of a specific user in the persistence layer.
     * This method also marks the new email as unverified, which is a common practice to ensure
     * that the user confirms ownership of the new email address before it becomes active.
     * The operation relies on the database to enforce uniqueness constraints on the email field.
     *
     * @param id - The unique identifier (UUID) of the user whose email is to be updated.
     * @param newEmail - The new email address string that the user wants to associate with their account.
     */
    async updateEmail(id: string, newEmail: string): Promise<void> {
        try {
            await this.prisma.user.update({
                where: { id },
                data: {
                    email: newEmail,
                    isEmailVerified: false,
                },
            });
        } catch (error: unknown) {
            this.handleP2002(
                error,
                new ConflictError(
                    "This email address is already in use by another account.",
                ),
            );
        }
    }

    private handleP2002(error: unknown, conflictError: CustomError): never {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            throw conflictError;
        }
        throw error as Error;
    }
}
