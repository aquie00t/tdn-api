/**
 * What one digest run did.
 */
export interface SendDailyDigestOutput {
    /** Eligible recipients the sweep looked at. */
    scanned: number;

    /** Digests the provider accepted. */
    sent: number;

    /**
     * Recipients passed over: nothing waiting for them, or another instance
     * had already claimed their digest for today.
     */
    skipped: number;

    /** Recipients whose digest could not be assembled or was refused. */
    failed: number;
}
