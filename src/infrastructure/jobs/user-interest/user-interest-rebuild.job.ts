import type {
    RebuildUserInterestsUseCase,
    RebuildUserInterestsOutput,
} from "@core/use-cases/user-interest/rebuild-user-interests";

/**
 * Job that refreshes the materialised interest profiles the feed ranks on.
 */
export class UserInterestRebuildJob {
    /**
     * Creates a new instance of UserInterestRebuildJob.
     *
     * @param rebuildUserInterestsUseCase - Use case that does the rebuilding
     */
    constructor(
        private readonly rebuildUserInterestsUseCase: RebuildUserInterestsUseCase,
    ) {}

    /**
     * Rebuilds the profile of every recently active user.
     *
     * @returns How many profiles were rebuilt and how many were skipped
     */
    async run(): Promise<RebuildUserInterestsOutput> {
        return this.rebuildUserInterestsUseCase.execute();
    }
}
