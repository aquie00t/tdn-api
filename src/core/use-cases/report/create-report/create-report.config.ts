/**
 * The knobs content reporting is tuned with, all from environment
 * configuration.
 */
export interface CreateReportConfig {
    /**
     * How many separate people must report one piece of content before the
     * operator is interrupted.
     *
     * Above one on purpose. A single report is a claim; several independent
     * ones are a signal, and a threshold is what keeps one determined account
     * from being able to summon an email about anybody it dislikes.
     */
    alertThreshold: number;

    /** Where moderation mail goes. Empty disables it. */
    alertEmail: string;

    /** Origin the web app is served from, for the link in the email. */
    frontendUrl: string;

    /** Longest excerpt of reported text to carry into an email. */
    excerptLength: number;

    /** Most reporter notes to carry per target. */
    maxDetails: number;
}
