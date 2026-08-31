/**
 * Input interface for rebuilding user interest profiles.
 */
export interface RebuildUserInterestsInput {
    /**
     * Rebuild only this user's profile.
     *
     * Omitted by the cron job, which visits every recently active user. Present
     * when a single profile has to be refreshed on demand - a backfill, or an
     * operator investigating one account's feed.
     */
    userId?: string;
}
