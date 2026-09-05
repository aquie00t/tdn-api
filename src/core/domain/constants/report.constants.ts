/**
 * Longest excerpt of reported text carried into a moderation email.
 *
 * A constant rather than a knob: it exists to keep one long post from filling
 * an inbox, and the operator who would tune it can read the whole row in the
 * database anyway.
 */
export const REPORT_EXCERPT_LENGTH = 280;

/**
 * Most reporter notes carried per reported item.
 *
 * Enough to see whether several people are describing the same thing, short of
 * reprinting every word a brigade wrote.
 */
export const REPORT_MAX_DETAILS = 5;

/**
 * Longest note a reporter may write, enforced by the HTTP schema.
 */
export const REPORT_DETAILS_MAX_LENGTH = 500;
