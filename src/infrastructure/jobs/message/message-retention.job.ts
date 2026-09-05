import type {
    PurgeExpiredMessagesOutput,
    PurgeExpiredMessagesUseCase,
} from "@core/use-cases/message/purge-expired";

/**
 * Runs one message retention pass.
 */
export class MessageRetentionJob {
    /**
     * Creates a new instance of MessageRetentionJob.
     *
     * @param purgeExpiredMessagesUseCase - The use case that does the removing
     */
    constructor(
        private readonly purgeExpiredMessagesUseCase: PurgeExpiredMessagesUseCase,
    ) {}

    /**
     * Executes the pass.
     *
     * @param retentionDays - How many days of history to keep
     * @returns What the pass removed
     */
    async run(retentionDays: number): Promise<PurgeExpiredMessagesOutput> {
        return this.purgeExpiredMessagesUseCase.execute(retentionDays);
    }
}
