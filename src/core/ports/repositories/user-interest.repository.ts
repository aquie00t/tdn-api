import type {
    InteractionSignal,
    UserInterest,
} from "@core/domain/interfaces/user-interest.interface";

/**
 * A page of user ids, and where to resume from.
 */
export interface UserIdPage {
    userIds: string[];

    /**
     * The id to pass as `after` for the next page, or null at the end.
     *
     * Keyset rather than an offset: the job walks this while people keep
     * signing up and interacting, and an offset would skip users as earlier
     * rows shift under it.
     */
    nextCursor: string | null;
}

/**
 * Repository interface for materialised user interest profiles.
 *
 * Following Clean Architecture principles, this interface defines the contract
 * for reading the signals a profile is built from and for storing the result,
 * without exposing how either is queried.
 */
export interface IUserInterestRepository {
    /**
     * Retrieves a user's stored interest profile.
     *
     * @param userId - The user whose profile to read.
     * @returns Their interests; empty when the job has never run for them.
     */
    findByUserId(userId: string): Promise<UserInterest[]>;

    /**
     * Lists users who have interacted with anything since a given time.
     *
     * The job rebuilds only these: recomputing a profile for someone who has
     * done nothing produces the same rows it already has, and the platform has
     * far more dormant accounts than active ones.
     *
     * @param since - Only users active at or after this time.
     * @param limit - Page size.
     * @param after - Resume after this user id, from a previous page's cursor.
     * @returns A page of user ids in ascending id order.
     */
    findActiveUserIds(
        since: Date,
        limit: number,
        after?: string,
    ): Promise<UserIdPage>;

    /**
     * Retrieves the interactions a user's profile should be built from.
     *
     * @param userId - The user whose interactions to read.
     * @param since - How far back to look.
     * @param limit - Hard cap on signals, newest first, so one prolific
     * account cannot make the job unbounded.
     * @returns What the user did, with the tags and categories of each post.
     */
    findInteractionSignals(
        userId: string,
        since: Date,
        limit: number,
    ): Promise<InteractionSignal[]>;

    /**
     * Replaces a user's whole interest profile.
     *
     * Replace rather than upsert: the profile is derived data with no history
     * worth keeping, and an interest that has decayed out of the new set has
     * to actually disappear. Implementations must make the delete and the
     * insert atomic, so a failure cannot leave a user with no profile at all.
     *
     * @param userId - The user whose profile to replace.
     * @param interests - The new profile; an empty array clears it.
     */
    replaceForUser(userId: string, interests: UserInterest[]): Promise<void>;
}
