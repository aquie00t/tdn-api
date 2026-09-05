/**
 * Output DTO for the SendReportDigestUseCase.
 *
 * Read by the scheduler's log line, which is the only place a run is visible:
 * there is no dashboard, so a morning that sent nothing has to be able to say
 * whether that was an empty queue or a claim somebody else won.
 */
export interface SendReportDigestUseCaseOutput {
    /** Whether an email was handed to the provider. */
    sent: boolean;

    /** How many pieces of content the email covered. */
    items: number;

    /** Every report still open, including any the email had to cut. */
    pending: number;

    /**
     * Whether another instance had already claimed this morning. Reported
     * separately from an empty queue - they look identical in a log line
     * otherwise, and they mean opposite things.
     */
    alreadyClaimed: boolean;
}
