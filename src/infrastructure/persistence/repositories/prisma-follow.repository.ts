import type { PrismaTransactionalClient } from "@infrastructure/persistence/database/prisma-client.type";
import { isVerified } from "@core/use-cases/shared/verification/is-verified";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";

export class PrismaFollowUserRepository implements IFollowRepository {
    constructor(private readonly prisma: PrismaTransactionalClient) {}

    async checkIsFollowing(
        followerId: string,
        followingId: string,
    ): Promise<boolean> {
        const follow = await this.prisma.follow.findUnique({
            where: {
                followerId_followingId: {
                    followerId,
                    followingId,
                },
            },
        });
        return follow !== null;
    }

    async followUser(
        followerId: string,
        followingId: string,
    ): Promise<boolean> {
        // createMany with skipDuplicates compiles to ON CONFLICT DO NOTHING,
        // so concurrent follows settle in the database instead of racing:
        // create() would raise P2002 on the composite primary key for the
        // request that lost, and that surfaced as a 500.
        const result = await this.prisma.follow.createMany({
            data: [{ followerId, followingId }],
            skipDuplicates: true,
        });

        return result.count > 0;
    }

    async unfollowUser(
        followerId: string,
        followingId: string,
    ): Promise<boolean> {
        // deleteMany rather than delete: deleting a row that is already gone
        // is the expected outcome of a double tap, not P2025.
        const result = await this.prisma.follow.deleteMany({
            where: {
                followerId,
                followingId,
            },
        });

        return result.count > 0;
    }

    async getFollowers(
        targetId: string,
        limit: number,
        offset: number,
    ): Promise<
        {
            userId: string;
            username: string;
            fullName: string;
            avatarUrl: string;
            isVerified: boolean;
            bio: string | null;
        }[]
    > {
        const follows = await this.prisma.follow.findMany({
            where: { followingId: targetId },
            take: limit,
            skip: offset,
            orderBy: { createdAt: "desc" },
            select: {
                follower: {
                    select: {
                        id: true,
                        username: true,
                        verifiedUntil: true,
                        profile: {
                            select: {
                                fullName: true,
                                avatarUrl: true,
                                bio: true,
                            },
                        },
                    },
                },
            },
        });

        return follows.map((f) => ({
            userId: f.follower.id,
            username: f.follower.username,
            fullName: f.follower.profile?.fullName || "",
            avatarUrl: f.follower.profile?.avatarUrl || "",
            isVerified: isVerified(f.follower.verifiedUntil),
            bio: f.follower.profile?.bio || null,
        }));
    }

    async getFollowing(
        targetId: string,
        limit: number,
        offset: number,
    ): Promise<
        {
            userId: string;
            username: string;
            fullName: string;
            avatarUrl: string;
            isVerified: boolean;
            bio: string | null;
        }[]
    > {
        const follows = await this.prisma.follow.findMany({
            where: { followerId: targetId },
            take: limit,
            skip: offset,
            orderBy: { createdAt: "desc" },
            select: {
                following: {
                    select: {
                        id: true,
                        username: true,
                        verifiedUntil: true,
                        profile: {
                            select: {
                                fullName: true,
                                avatarUrl: true,
                                bio: true,
                            },
                        },
                    },
                },
            },
        });

        return follows.map((f) => ({
            userId: f.following.id,
            username: f.following.username,
            fullName: f.following.profile?.fullName || "",
            avatarUrl: f.following.profile?.avatarUrl || "",
            isVerified: isVerified(f.following.verifiedUntil),
            bio: f.following.profile?.bio || null,
        }));
    }

    async checkIsFollowingBulk(
        followerId: string,
        followingIds: string[],
    ): Promise<string[]> {
        if (followingIds.length === 0) return [];

        const follows = await this.prisma.follow.findMany({
            where: {
                followerId: followerId,
                followingId: { in: followingIds },
            },
            select: { followingId: true },
        });

        return follows.map((f) => f.followingId);
    }

    async getFollowersCount(userId: string): Promise<number> {
        return this.prisma.follow.count({ where: { followingId: userId } });
    }

    async getFollowingIds(followerId: string): Promise<string[]> {
        const follows = await this.prisma.follow.findMany({
            where: { followerId },
            select: { followingId: true },
        });
        return follows.map((f) => f.followingId);
    }

    async getFollowerIds(userId: string): Promise<string[]> {
        const follows = await this.prisma.follow.findMany({
            where: { followingId: userId, follower: { deletedAt: null } },
            select: { followerId: true },
        });
        return follows.map((f) => f.followerId);
    }
}
