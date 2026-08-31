import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import type { UpdateProfileInput } from "@core/use-cases/profile/update-profil/update-profile-usecase.input";
import type { Profile as PrismaProfile } from "@generated/prisma/client";
import type { Profile } from "@core/domain/entities/profile.entity";
import type { PostCategory } from "@core/domain/enums/post-category-enum";
import type { PrismaTransactionalClient } from "@infrastructure/persistence/database/prisma-client.type";
import { ProfilePrismaMapper } from "@infrastructure/persistence/mappers/profile-prisma.mapper";

export class PrismaProfileRepository implements IProfileRepository {
    constructor(private readonly prisma: PrismaTransactionalClient) {}

    async findByUserId(userId: string): Promise<Profile | null> {
        const profile = await this.prisma.profile.findUnique({
            where: { userId },
        });

        if (!profile) return null;

        return ProfilePrismaMapper.toDomain(profile as PrismaProfile);
    }

    async update(userId: string, data: UpdateProfileInput): Promise<void> {
        await this.prisma.profile.updateMany({
            where: { userId },
            data: ProfilePrismaMapper.toPrismaUpdate(data),
        });
    }

    async updateAvatar(userId: string, avatarUrl: string): Promise<void> {
        await this.prisma.profile.update({
            where: { userId },
            data: {
                avatarUrl: avatarUrl,
            },
        });
    }

    async findAvatarByUserId(userId: string): Promise<string | null> {
        const profile = await this.prisma.profile.findUnique({
            where: { userId },
            select: { avatarUrl: true },
        });

        return profile?.avatarUrl ?? null;
    }

    async findLanguagesByUserId(userId: string): Promise<string[]> {
        const profile = await this.prisma.profile.findUnique({
            where: { userId },
            select: { languages: true },
        });

        return profile?.languages ?? [];
    }

    async updateBanner(userId: string, bannerUrl: string): Promise<void> {
        await this.prisma.profile.update({
            where: { userId },
            data: {
                bannerUrl,
            },
        });
    }

    async findBannerByUserId(userId: string): Promise<string | null> {
        const profile = await this.prisma.profile.findUnique({
            where: { userId },
            select: { bannerUrl: true },
        });

        return profile?.bannerUrl ?? null;
    }

    async findByUsername(username: string): Promise<Profile | null> {
        const dbProfile = await this.prisma.profile.findFirst({
            where: {
                user: {
                    username: username,
                },
            },
            include: {
                user: {
                    include: {
                        _count: {
                            select: {
                                followers: true,
                                following: true,
                            },
                        },
                    },
                },
            },
        });

        if (!dbProfile) return null;

        return ProfilePrismaMapper.toDomain(dbProfile);
    }

    async search(query: string, limit: number = 10): Promise<Profile[]> {
        const dbProfiles = await this.prisma.profile.findMany({
            where: {
                OR: [
                    {
                        fullName: {
                            contains: query,
                            mode: "insensitive",
                        },
                    },
                    {
                        user: {
                            username: {
                                contains: query,
                                mode: "insensitive",
                            },
                        },
                    },
                ],
            },
            include: {
                user: true,
            },
            take: limit,
        });

        return dbProfiles.map((dbProfile) =>
            ProfilePrismaMapper.toDomain(dbProfile),
        );
    }

    async getSuggestedUsers(
        currentUserId: string | null,
        limit: number,
    ): Promise<Profile[]> {
        const dbProfiles = await this.prisma.profile.findMany({
            where: {
                user: {
                    deletedAt: null,
                    ...(currentUserId
                        ? {
                              id: { not: currentUserId },
                              followers: {
                                  none: { followerId: currentUserId },
                              },
                          }
                        : {}),
                },
            },
            include: {
                user: {
                    include: {
                        _count: {
                            select: {
                                followers: true,
                                following: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                user: {
                    followers: {
                        _count: "desc",
                    },
                },
            },
            take: limit,
        });

        return dbProfiles.map((dbProfile) =>
            ProfilePrismaMapper.toDomain(dbProfile),
        );
    }

    async findBotProfiles(
        categories: PostCategory[] | undefined,
        limit: number,
        offset: number,
    ): Promise<Profile[]> {
        const dbProfiles = await this.prisma.profile.findMany({
            where: {
                // Hard-coded: this endpoint must never surface human accounts.
                user: { isBot: true, deletedAt: null },
                // Carrying a category is what makes an account a news bot here.
                // The persona bots that keep the feed from looking empty are
                // also isBot, and onboarding must not offer them as news
                // sources - they are meant to read as ordinary users. They
                // never get a category, so requiring one excludes them without
                // a second flag on User to keep in sync.
                categories: categories?.length
                    ? { hasSome: categories }
                    : { isEmpty: false },
            },
            include: {
                user: {
                    include: {
                        _count: {
                            select: {
                                followers: true,
                                following: true,
                            },
                        },
                    },
                },
            },
            // userId breaks ties: at onboarding time most bots share a follower
            // count, and without a total order take/skip can repeat or drop rows
            // across pages.
            orderBy: [
                { user: { followers: { _count: "desc" } } },
                { userId: "asc" },
            ],
            take: limit,
            skip: offset,
        });

        return dbProfiles.map((dbProfile) =>
            ProfilePrismaMapper.toDomain(dbProfile),
        );
    }
}
