/**
 * The knobs the morning report summary is tuned with, all from environment
 * configuration.
 */
export interface SendReportDigestConfig {
    /** Whether the summary runs at all. */
    enabled: boolean;

    /** Where moderation mail goes. Empty disables the summary. */
    alertEmail: string;

    /**
     * Most reports one email covers.
     *
     * A cap rather than paging: an email nobody can finish reading is the same
     * as no email, and the count of everything still open is reported beside
     * the contents so a truncated morning says so.
     */
    maxReports: number;

    /** Origin the web app is served from, for links in the email. */
    frontendUrl: string;

    /** Longest excerpt of reported text to carry into the email. */
    excerptLength: number;

    /** Most reporter notes to carry per target. */
    maxDetails: number;

    /** Timezone the summary's calendar day is measured in. */
    timezone: string;
}
