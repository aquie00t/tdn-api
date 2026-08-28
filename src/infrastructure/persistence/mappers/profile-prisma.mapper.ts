import { Profile } from "@core/domain/entities/profile.entity";
import type { PostCategory } from "@core/domain/enums/post-category-enum";
import type { UpdateProfileInput } from "@core/use-cases/profile/update-profil/update-profile-usecase.input";
import type {
    Prisma,
    Profile as PrismaProfile,
} from "@generated/prisma/client";

type PrismaProfileWithUserAndCounts = PrismaProfile & {
    user?: {
        username: string;
        _count?: {
            followers: number;
            following: number;
        };
    };
};

/**
 * Mapper class responsible for transforming Profile data across different layers.
 * Handles conversions between Prisma database records, Domain entities, and safe Response objects.
 */
export class ProfilePrismaMapper {
    /**
     * Maps a Prisma database record to a core Domain entity.
     *
     * @param dbProfile - The profile record retrieved from the Prisma database.
     * @returns The instantiated Profile domain entity.
     */
    static toDomain(dbProfile: PrismaProfileWithUserAndCounts): Profile {
        return Profile.with({
            id: dbProfile.id,
            userId: dbProfile.userId,

            username: dbProfile.user?.username || "unknown",
            fullName: dbProfile.fullName,
            bio: dbProfile.bio,
            location: dbProfile.location,
            avatarUrl: dbProfile.avatarUrl,
            bannerUrl: dbProfile.bannerUrl,
            socials: dbProfile.socials as Record<string, string>,
            categories: dbProfile.categories as PostCategory[],
            createdAt: dbProfile.createdAt,
            updatedAt: dbProfile.updatedAt,
            followersCount: dbProfile.user?._count?.followers || 0,
            followingCount: dbProfile.user?._count?.following || 0,
        });
    }

    /**
     * Maps an UpdateProfileInput DTO to a Prisma-compatible update object.
     * Avatar and banner are excluded — those have dedicated repository methods.
     *
     * @param data - The partial profile update input.
     * @returns The Prisma-formatted data object for updates.
     */
    static toPrismaUpdate(data: UpdateProfileInput): Prisma.ProfileUpdateInput {
        return {
            fullName: data.fullName,
            bio: data.bio,
            location: data.location,
            socials: data.socials as Prisma.InputJsonValue,
            categories: data.categories,
            updatedAt: new Date(),
        };
    }

    /**
     * Maps a Domain entity to a safe public response object.
     *
     * @param profile - The Profile domain entity.
     * @returns A sanitized profile object safe for external API responses.
     */
    static toResponse(profile: Profile): {
        id: string;
        username: string;
        fullName: string;
        bio: string | null;
        location: string | null;
        avatarUrl: string;
        bannerUrl: string;
        socials: Record<string, string>;
        categories: PostCategory[];
        createdAt: Date;
        updatedAt: Date;
        followersCount: number;
        followingCount: number;
    } {
        return {
            id: profile.userId,
            username: profile.username,
            fullName: profile.fullName,
            bio: profile.bio,
            location: profile.location,
            avatarUrl: profile.avatarUrl,
            bannerUrl: profile.bannerUrl,
            socials: profile.socials,
            categories: profile.categories,
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
            followersCount: profile.followersCount,
            followingCount: profile.followingCount,
        };
    }
}
