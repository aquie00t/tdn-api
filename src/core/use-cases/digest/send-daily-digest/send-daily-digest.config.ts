/**
 * The knobs the digest run is tuned with, all from environment configuration.
 */
export interface SendDailyDigestConfig {
    /** How far back a first-ever digest reaches. */
    windowHours: number;

    /**
     * Ceiling on that window for somebody who has not received one in a while.
     *
     * Without it, a user returning after three months would be mailed three
     * months of notifications in one page.
     */
    maxWindowDays: number;

    /** Recipients fetched per page of the audience sweep. */
    userPageSize: number;

    /** Most notifications one email lists. */
    maxNotifications: number;

    /** Most posts one email lists. */
    maxPosts: number;

    /** Size of the shared candidate pool the run ranks per user. */
    candidatePoolSize: number;

    /** Origin the web app is served from, for links in the email. */
    frontendUrl: string;

    /** Origin this API is served from, for the unsubscribe link. */
    apiUrl: string;

    /** Key the unsubscribe link is signed with. */
    unsubscribeSecret: string;

    /** Timezone the digest's calendar day is measured in. */
    timezone: string;
}
