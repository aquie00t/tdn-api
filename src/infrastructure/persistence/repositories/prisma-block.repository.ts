import type { PrismaTransactionalClient } from "@infrastructure/persistence/database/prisma-client.type";
import { isVerified } from "@core/use-cases/shared/verification/is-verified";
import type {
    BlockedUserSummary,
    BlockPairState,
    IBlockRepository,
} from "@core/ports/repositories/block.repository";

/**
 * Prisma-backed implementation of {@link IBlockRepository}.
 */
export class PrismaBlockRepository implements IBlockRepository {
    /**
     * Creates a new PrismaBlockRepository instance.
     *
     * @param prisma - The Prisma client, or a transaction-scoped client.
     */
    constructor(private readonly prisma: PrismaTransactionalClient) {}

    /**
     * Creates a block, if it is not there yet.
     *
     * @param blockerId - The user doing the blocking.
     * @param blockedId - The user being blocked.
     * @returns True when this call created the row.
     */
    async block(blockerId: string, blockedId: string): Promise<boolean> {
        // createMany with skipDuplicates compiles to ON CONFLICT DO NOTHING,
        // so concurrent blocks settle in the database instead of racing:
        // create() would raise P2002 on the composite primary key for the
        // request that lost, and that surfaces as a 500.
        const result = await this.prisma.block.createMany({
            data: [{ blockerId, blockedId }],
            skipDuplicates: true,
        });

        return result.count > 0;
    }

    /**
     * Removes a block, if it is still there.
     *
     * @param blockerId - The user who blocked.
     * @param blockedId - The user who was blocked.
     * @returns True when this call removed the row.
     */
    async unblock(blockerId: string, blockedId: string): Promise<boolean> {
        // deleteMany rather than delete: lifting a block that is already gone
        // is the expected outcome of a double tap, not P2025.
        const result = await this.prisma.block.deleteMany({
            where: { blockerId, blockedId },
        });

        return result.count > 0;
    }

    /**
     * Whether a block stands between two users, in either direction.
     *
     * @param userId - One of the two users.
     * @param otherId - The other user.
     * @returns True when either has blocked the other.
     */
    async existsBetween(userId: string, otherId: string): Promise<boolean> {
        const found = await this.prisma.block.findFirst({
            where: {
                OR: [
                    { blockerId: userId, blockedId: otherId },
                    { blockerId: otherId, blockedId: userId },
                ],
            },
            select: { blockerId: true },
        });

        return found !== null;
    }

    /**
     * Reports both directions between two users.
     *
     * One query rather than two: at most two rows can match, and which
     * direction each one is follows from its `blockerId`.
     *
     * @param viewerId - The user the answer is phrased from.
     * @param otherId - The user being looked at.
     * @returns Which direction, or directions, hold.
     */
    async findPairState(
        viewerId: string,
        otherId: string,
    ): Promise<BlockPairState> {
        const rows = await this.prisma.block.findMany({
            where: {
                OR: [
                    { blockerId: viewerId, blockedId: otherId },
                    { blockerId: otherId, blockedId: viewerId },
                ],
            },
            select: { blockerId: true },
        });

        return {
            isBlocked: rows.some((row) => row.blockerId === viewerId),
            isBlockedBy: rows.some((row) => row.blockerId === otherId),
        };
    }

    /**
     * Every user this viewer cannot see, and who cannot see them.
     *
     * @param viewerId - The user the set is computed for.
     * @returns The user IDs to exclude.
     */
    async getInvisibleUserIds(viewerId: string): Promise<string[]> {
        const rows = await this.prisma.block.findMany({
            where: {
                OR: [{ blockerId: viewerId }, { blockedId: viewerId }],
            },
            select: { blockerId: true, blockedId: true },
        });

        // Mutual blocks produce two rows naming the same person, so the pair
        // is collapsed rather than handed to a `notIn` twice.
        const ids = new Set<string>();

        for (const row of rows) {
            ids.add(row.blockerId === viewerId ? row.blockedId : row.blockerId);
        }

        return [...ids];
    }

    /**
     * Retrieves a paginated list of the accounts this user has blocked.
     *
     * @param blockerId - The user whose blocks are being listed.
     * @param limit - The maximum number of rows to retrieve.
     * @param offset - The number of rows to skip.
     * @returns The blocked accounts, newest block first.
     */
    async listBlocked(
        blockerId: string,
        limit: number,
        offset: number,
    ): Promise<BlockedUserSummary[]> {
        const blocks = await this.prisma.block.findMany({
            where: { blockerId },
            take: limit,
            skip: offset,
            orderBy: { createdAt: "desc" },
            select: {
                blocked: {
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

        return blocks.map((block) => ({
            userId: block.blocked.id,
            username: block.blocked.username,
            fullName: block.blocked.profile?.fullName || "",
            avatarUrl: block.blocked.profile?.avatarUrl || "",
            isVerified: isVerified(block.blocked.verifiedUntil),
            bio: block.blocked.profile?.bio || null,
        }));
    }

    /**
     * Counts how many accounts this user has blocked.
     *
     * @param blockerId - The user whose blocks are being counted.
     * @returns The total number of blocks they hold.
     */
    async countBlocked(blockerId: string): Promise<number> {
        return await this.prisma.block.count({ where: { blockerId } });
    }
}
