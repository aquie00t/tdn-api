import type { IReportRepository } from "@core/ports/repositories/report.repository";

/**
 * Use case for dropping reports that have aged out.
 *
 * A report carries a copy of what somebody wrote, which is the reason it is
 * useful to an operator and also the reason it should not be kept forever:
 * after a point it is a private archive of things people said, held for no
 * remaining purpose. Age is the only criterion - a report that is still
 * PENDING when it expires has been sitting in every morning summary since it
 * was filed, and keeping it longer would not make anybody read it.
 */
export class PurgeOldReportsUseCase {
    /**
     * Creates a new instance of PurgeOldReportsUseCase.
     *
     * @param reportRepository - Repository for managing report data
     */
    constructor(private readonly reportRepository: IReportRepository) {}

    /**
     * Executes the purge, removing reports older than the retention window.
     *
     * @param retentionDays - How many days a report is kept
     * @returns The number of reports that were deleted
     */
    async execute(retentionDays: number): Promise<number> {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - retentionDays);

        return this.reportRepository.deleteOlderThan(cutoff);
    }
}
