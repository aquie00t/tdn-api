import type { Prisma, User as PrismaUser } from "@generated/prisma/client";
import { User } from "@core/domain/entities/user.entity";
/**
 * Mapper class responsible for transforming User data across different layers.
 * Handles conversions between Prisma database records and Domain entities.
 */
export class UserPrismaMapper {
    /**
     * Maps a Prisma database record to a core Domain entity.
     *
     * @param dbUser - The user record retrieved from the Prisma database.
     * @returns The instantiated User domain entity.
     */
    static toDomainUser(dbUser: PrismaUser): User {
        return User.with({
            id: dbUser.id,
            email: dbUser.email,
            username: dbUser.username,
            passwordHash: dbUser.password,
            isBot: dbUser.isBot,
            isEmailVerified: dbUser.isEmailVerified,
            deletedAt: dbUser.deletedAt,
            bannedAt: dbUser.bannedAt,
            digestOptOutAt: dbUser.digestOptOutAt,
            createdAt: dbUser.createdAt,
            updatedAt: dbUser.updatedAt,
        });
    }

    /**
     * Maps domain creation input to a Prisma-compatible creation object.
     *
     * @param input - The core user data required for creation.
     * @returns The Prisma-formatted input object for creating a new user record.
     */
    static toPrismaCreateUser(input: {
        email: string;
        username: string;
        passwordHash: string | null;
    }): Prisma.UserCreateInput {
        return {
            email: input.email,
            username: input.username,
            password: input.passwordHash,
        };
    }
}
