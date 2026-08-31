/**
 * Output interface for a rebuild run.
 */
export interface RebuildUserInterestsOutput {
    /** How many profiles were rebuilt successfully. */
    rebuilt: number;

    /**
     * How many users were skipped after their rebuild threw.
     *
     * Reported rather than thrown so the scheduler can log a partial run for
     * what it is: most profiles refreshed, some left stale.
     */
    failed: number;
}
