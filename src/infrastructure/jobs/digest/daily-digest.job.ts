import type {
    SendDailyDigestOutput,
    SendDailyDigestUseCase,
} from "@core/use-cases/digest/send-daily-digest";

/**
 * Runs one morning digest pass.
 */
export class DailyDigestJob {
    /**
     * Creates a new instance of DailyDigestJob.
     *
     * @param sendDailyDigestUseCase - The use case that assembles and sends the digests
     */
    constructor(
        private readonly sendDailyDigestUseCase: SendDailyDigestUseCase,
    ) {}

    /**
     * Executes the pass.
     *
     * @returns How many recipients were looked at, mailed, passed over and failed
     */
    async run(): Promise<SendDailyDigestOutput> {
        return this.sendDailyDigestUseCase.execute();
    }
}
