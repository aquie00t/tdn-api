import type {
    ModeratePendingMediaOutput,
    ModeratePendingMediaUseCase,
} from "@core/use-cases/media/moderate-pending-media";

/**
 * Background job that resolves the videos waiting for a moderation verdict.
 */
export class MediaModerationJob {
    /**
     * Creates a new instance of MediaModerationJob.
     *
     * @param moderatePendingMediaUseCase - Use case that scans one batch
     */
    constructor(
        private readonly moderatePendingMediaUseCase: ModeratePendingMediaUseCase,
    ) {}

    /**
     * Runs one pass.
     *
     * @returns What the pass did, for the scheduler's log line
     */
    async run(): Promise<ModeratePendingMediaOutput> {
        return await this.moderatePendingMediaUseCase.execute();
    }
}
