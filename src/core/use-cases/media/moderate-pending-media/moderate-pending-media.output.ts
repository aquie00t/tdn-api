/**
 * What one pass of the video moderation worker did.
 *
 * Returned rather than only logged so the scheduler can report a summary line
 * per tick, in the same shape as the purge jobs.
 */
export interface ModeratePendingMediaOutput {
    /** How many assets were claimed and scanned. */
    scanned: number;

    /** How many came back clean. */
    approved: number;

    /** How many were marked borderline. */
    sensitive: number;

    /** How many were refused and deleted. */
    rejected: number;

    /** How many could not be scanned at all this pass. */
    failed: number;
}
