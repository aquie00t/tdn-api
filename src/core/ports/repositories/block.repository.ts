/**
 * One side of a block, as a profile row.
 *
 * The same shape the follower lists return, so the client can render a
 * blocked-accounts screen with the component it already has.
 */
export interface BlockedUserSummary {
    userId: string;
    username: string;
    fullName: string;
    avatarUrl: string;
    bio: string | null;
}

/**
 * How two users stand with respect to each other.
 *
 * Both directions are reported because they render differently: "you blocked
 * this account" offers an unblock button, "this account blocked you" is a wall.
 */
export interface BlockPairState {
    /** The viewer blocked the other user. */
    isBlocked: boolean;

    /** The other user blocked the viewer. */
    isBlockedBy: boolean;
}

/**
 * Repository interface for managing Block relationships.
 *
 * Following Clean Architecture principles, this interface defines the contract
 * for persisting and retrieving blocks without exposing implementation details
 * or DTOs.
 */
export interface IBlockRepository {
    /**
     * Creates a block, if it is not there yet.
     *
     * Idempotent, and it has to be for the same reason
     * {@link IFollowRepository.followUser} is: reading first and then writing
     * leaves a window in which two overlapping requests both see no block and
     * both insert, and the loser hits the composite primary key.
     *
     * @param blockerId - The ID of the user doing the blocking.
     * @param blockedId - The ID of the user being blocked.
     * @returns True when this call created the block, false when it was
     * already there.
     */
    block(blockerId: string, blockedId: string): Promise<boolean>;

    /**
     * Removes a block, if it is still there.
     *
     * Idempotent for the same reason as {@link block}: lifting a block that is
     * already gone is the expected outcome of a double tap, not a failure.
     *
     * @param blockerId - The ID of the user who blocked.
     * @param blockedId - The ID of the user who was blocked.
     * @returns True when this call removed the block, false when there was
     * nothing to remove.
     */
    unblock(blockerId: string, blockedId: string): Promise<boolean>;

    /**
     * Whether a block stands between two users, in either direction.
     *
     * The question almost every gate asks: blocking hides people from each
     * other, so which side wrote the row does not change the answer.
     *
     * @param userId - One of the two users.
     * @param otherId - The other user.
     * @returns True when either has blocked the other.
     */
    existsBetween(userId: string, otherId: string): Promise<boolean>;

    /**
     * Reports both directions between two users.
     *
     * Used where the two sides render differently - a profile - rather than
     * where they merely gate an action.
     *
     * @param viewerId - The user the answer is phrased from.
     * @param otherId - The user being looked at.
     * @returns Which direction, or directions, hold.
     */
    findPairState(viewerId: string, otherId: string): Promise<BlockPairState>;

    /**
     * Every user this viewer cannot see, and who cannot see them.
     *
     * The union of both directions, and the single method the listing reads
     * are built on: symmetric invisibility means a feed, an inbox or a search
     * needs one exclusion set rather than a per-row question.
     *
     * @param viewerId - The user the set is computed for.
     * @returns The user IDs to exclude, in no particular order.
     */
    getInvisibleUserIds(viewerId: string): Promise<string[]>;

    /**
     * Retrieves a paginated list of the accounts this user has blocked.
     *
     * Only the blocks this user wrote: the accounts that blocked *them* are
     * not theirs to manage, and listing them would hand out a mirror of who
     * dislikes them.
     *
     * @param blockerId - The ID of the user whose blocks are being listed.
     * @param limit - The maximum number of rows to retrieve.
     * @param offset - The number of rows to skip (for pagination).
     * @returns The blocked accounts, newest block first.
     */
    listBlocked(
        blockerId: string,
        limit: number,
        offset: number,
    ): Promise<BlockedUserSummary[]>;

    /**
     * Counts how many accounts this user has blocked.
     *
     * @param blockerId - The ID of the user whose blocks are being counted.
     * @returns The total number of blocks they hold.
     */
    countBlocked(blockerId: string): Promise<number>;
}
