import type { PurgeOldReportsUseCase } from "@core/use-cases/report/purge-old-reports";

/**
 * Runs one sweep of reports that have aged out.
 */
export class ReportPurgeJob {
    /**
     * Creates a new instance of ReportPurgeJob.
     *
     * @param purgeOldReportsUseCase - The use case that deletes them
     */
    constructor(
        private readonly purgeOldReportsUseCase: PurgeOldReportsUseCase,
    ) {}

    /**
     * Executes the sweep.
     *
     * @param retentionDays - How many days a report is kept
     * @returns How many reports were deleted
     */
    async run(retentionDays: number): Promise<number> {
        return this.purgeOldReportsUseCase.execute(retentionDays);
    }
}
