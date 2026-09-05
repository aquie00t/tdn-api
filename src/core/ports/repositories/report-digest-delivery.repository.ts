/**
 * Persistence contract for the record of report summaries already sent.
 */
export interface IReportDigestDeliveryRepository {
    /**
     * Claims a day's report summary, if nobody else has.
     *
     * The same guard {@link IDigestDeliveryRepository.claim} provides, and for
     * the same reason: several instances run this schedule and nothing
     * coordinates them, so the insert has to be the coordination. There is no
     * user here - the summary goes to one operator address, so a day is the
     * whole claim.
     *
     * @param digestOn - The calendar day the summary belongs to.
     * @param reportCount - How many reports the email will cover, recorded so
     * a quiet morning can be told apart from a failed one.
     * @returns True when this caller won the claim and should send.
     *
     * @remarks
     * Losing this claim to a crash costs the operator one morning's email and
     * nothing more: the summary reports the open queue rather than a window
     * since the last send, so tomorrow's covers everything today's would have.
     */
    claim(digestOn: Date, reportCount: number): Promise<boolean>;
}
