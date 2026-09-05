import type {
    SendReportDigestUseCase,
    SendReportDigestUseCaseOutput,
} from "@core/use-cases/report/send-report-digest";

/**
 * Runs one morning report summary pass.
 */
export class ReportDigestJob {
    /**
     * Creates a new instance of ReportDigestJob.
     *
     * @param sendReportDigestUseCase - The use case that assembles and sends the summary
     */
    constructor(
        private readonly sendReportDigestUseCase: SendReportDigestUseCase,
    ) {}

    /**
     * Executes the pass.
     *
     * @returns Whether an email went out, and what it covered
     */
    async run(): Promise<SendReportDigestUseCaseOutput> {
        return this.sendReportDigestUseCase.execute();
    }
}
