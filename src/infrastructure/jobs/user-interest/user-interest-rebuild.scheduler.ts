import type { FastifyBaseLogger } from "fastify";
import cron, { type ScheduledTask } from "node-cron";
import type { UserInterestRebuildJob } from "./user-interest-rebuild.job";

export interface UserInterestRebuildSchedulerOptions {
    cronExpression: string;
}

/**
 * Schedules the interest profile rebuild.
 *
 * Nightly by default rather than continuous: interests move over weeks, and a
 * profile that is a day stale ranks a feed indistinguishably from a fresh one.
 */
export class UserInterestRebuildScheduler {
    private task?: ScheduledTask;

    constructor(
        private readonly job: UserInterestRebuildJob,
        private readonly options: UserInterestRebuildSchedulerOptions,
        private readonly logger: FastifyBaseLogger,
    ) {}

    start(): void {
        if (this.task) return;

        this.task = cron.schedule(this.options.cronExpression, () => {
            void (async (): Promise<void> => {
                try {
                    const { rebuilt, failed } = await this.job.run();

                    this.logger.info(
                        {
                            job: "user-interest-rebuild",
                            rebuilt,
                            failed,
                            cronExpression: this.options.cronExpression,
                        },
                        "User interest rebuild completed successfully",
                    );
                } catch (error) {
                    this.logger.error(
                        { job: "user-interest-rebuild", error },
                        "User interest rebuild failed",
                    );
                }
            })();
        });

        this.logger.info("User Interest Rebuild Scheduler initialized");
    }

    stop(): void {
        if (!this.task) return;
        this.task = undefined;
    }
}
