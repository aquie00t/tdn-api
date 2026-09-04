/**
 * Persistence contract for the record of digests already sent.
 */
export interface IDigestDeliveryRepository {
    /**
     * Claims today's digest for a user, if nobody else has.
     *
     * This is the whole of the multi-instance guard. Several API instances run
     * the same morning schedule, and nothing coordinates them, so the claim
     * has to be the write itself: the unique constraint on (user, day) lets
     * exactly one instance through and tells the rest to move on.
     *
     * @param userId - The recipient being claimed.
     * @param digestOn - The calendar day the digest belongs to.
     * @returns True when this caller won the claim and should send.
     */
    claim(userId: string, digestOn: Date): Promise<boolean>;

    /**
     * Reads when a user last received a digest.
     *
     * The digest window starts here, so a user who was skipped yesterday - for
     * having nothing waiting - still sees the day before yesterday's news
     * today rather than losing it.
     *
     * @param userId - The recipient to look up.
     * @returns The timestamp of the most recent delivery, or null for a user
     * who has never received one.
     */
    findLastSentAt(userId: string): Promise<Date | null>;
}
