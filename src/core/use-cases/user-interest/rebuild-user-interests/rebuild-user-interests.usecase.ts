import type { IUserInterestRepository } from "@core/ports/repositories/user-interest.repository";
import type { LoggerPort } from "@core/ports/services/logger.port";
import {
    scoreInterests,
    type InterestScoringWeights,
} from "./interest-scoring";
import type { RebuildUserInterestsInput } from "./rebuild-user-interests.input";
import type { RebuildUserInterestsOutput } from "./rebuild-user-interests.output";

/**
 * How many users are pulled from the database at a time.
 *
 * The job holds one page of ids in memory and processes them one by one, so
 * this bounds memory rather than work.
 */
const USER_PAGE_SIZE = 200;

/**
 * Use case for rebuilding materialised user interest profiles.
 *
 * Runs from a cron job, never from a request: building one profile means
 * reading a user's likes, bookmarks, comments and posts across a multi-week
 * window and joining each to its tags. The feed then reads the result as a
 * handful of indexed rows.
 */
export class RebuildUserInterestsUseCase {
    /**
     * Creates a new instance of RebuildUserInterestsUseCase.
     *
     * @param userInterestRepository - Repository for interaction signals and profiles
     * @param interestScoringWeights - Tuning weights for the profile scorer
     * @param interestWindowDays - How far back interactions are read from
     * @param interestSignalLimit - Cap on signals read per interaction type
     * @param logger - Service for logging operations
     */
    constructor(
        private readonly userInterestRepository: IUserInterestRepository,
        private readonly interestScoringWeights: InterestScoringWeights,
        private readonly interestWindowDays: number,
        private readonly interestSignalLimit: number,
        private readonly logger: LoggerPort,
    ) {}

    /**
     * Rebuilds the profile of every user who has been active recently.
     *
     * @param input - Optionally narrows the run to a single user
     * @returns How many users were rebuilt and how many failed
     *
     * @remarks
     * Only active users are visited. Recomputing a dormant account's profile
     * produces the rows it already has, and the platform has far more dormant
     * accounts than active ones - the alternative is a job whose cost grows
     * with registrations rather than with usage.
     *
     * A user whose rebuild throws is logged and skipped rather than failing
     * the run. One unreadable profile must not stop the other thousands from
     * being refreshed, and the stale profile it leaves behind still ranks a
     * feed perfectly well.
     */
    async execute(
        input: RebuildUserInterestsInput = {},
    ): Promise<RebuildUserInterestsOutput> {
        const since = new Date(
            Date.now() - this.interestWindowDays * 24 * 60 * 60 * 1000,
        );

        if (input.userId) {
            const failed = await this.rebuildOne(input.userId, since);
            return { rebuilt: failed ? 0 : 1, failed: failed ? 1 : 0 };
        }

        let cursor: string | undefined;
        let rebuilt = 0;
        let failed = 0;

        for (;;) {
            const page = await this.userInterestRepository.findActiveUserIds(
                since,
                USER_PAGE_SIZE,
                cursor,
            );

            for (const userId of page.userIds) {
                if (await this.rebuildOne(userId, since)) {
                    failed++;
                } else {
                    rebuilt++;
                }
            }

            if (!page.nextCursor) break;
            cursor = page.nextCursor;
        }

        return { rebuilt, failed };
    }

    /**
     * Rebuilds one user's profile.
     *
     * @param userId - The user to rebuild.
     * @param since - How far back to read interactions.
     * @returns True when the rebuild failed and was skipped.
     */
    private async rebuildOne(userId: string, since: Date): Promise<boolean> {
        try {
            const signals =
                await this.userInterestRepository.findInteractionSignals(
                    userId,
                    since,
                    this.interestSignalLimit,
                );

            const interests = scoreInterests(
                signals,
                new Date(),
                this.interestScoringWeights,
            );

            // Written even when empty: a user whose every interest has decayed
            // away should stop being ranked on what they cared about a season
            // ago, which means the stale rows have to go.
            await this.userInterestRepository.replaceForUser(userId, interests);

            return false;
        } catch (err: unknown) {
            this.logger.error(
                { err, userId },
                "Failed to rebuild a user's interest profile",
            );
            return true;
        }
    }
}
