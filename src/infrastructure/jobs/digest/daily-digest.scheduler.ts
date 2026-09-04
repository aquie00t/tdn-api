import type { FastifyBaseLogger } from "fastify";
import cron, { type ScheduledTask } from "node-cron";
import type { DailyDigestJob } from "./daily-digest.job";

export interface DailyDigestSchedulerOptions {
    cronExpression: string;

    /**
     * Timezone the cron expression is read in.
     *
     * The other schedulers pass none and run in the container's local time,
     * which is fine for a purge and wrong for this: 09:00 has to mean 09:00
     * where the readers are, not wherever the service happens to be deployed.
     */
    timezone: string;

    /** When false the schedule is never started. */
    enabled: boolean;
}

/**
 * Runs the daily digest on a cron schedule.
 */
export class DailyDigestScheduler {
    private task?: ScheduledTask;

    /**
     * True while a pass is in flight.
     *
     * node-cron does not await the callback, so a pass that outlives its own
     * interval would otherwise have a second one start on top of it. The claim
     * rows would stop the duplicates reaching anybody's inbox, but the two
     * passes would still fight over the same recipients for no benefit.
     */
    private running = false;

    /**
     * Creates a new instance of DailyDigestScheduler.
     *
     * @param job - The job to run on each tick
     * @param options - Schedule, timezone and the feature switch
     * @param logger - Fastify logger
     */
    constructor(
        private readonly job: DailyDigestJob,
        private readonly options: DailyDigestSchedulerOptions,
        private readonly logger: FastifyBaseLogger,
    ) {}

    /**
     * Starts the schedule. Calling it twice is a no-op.
     */
    start(): void {
        if (this.task) return;

        if (!this.options.enabled) {
            this.logger.info(
                { job: "daily-digest" },
                "Daily digest is disabled; no schedule started",
            );
            return;
        }

        this.task = cron.schedule(
            this.options.cronExpression,
            () => {
                void (async (): Promise<void> => {
                    if (this.running) {
                        this.logger.warn(
                            { job: "daily-digest" },
                            "Skipping a daily digest tick: the previous pass is still running",
                        );
                        return;
                    }

                    this.running = true;

                    try {
                        const result = await this.job.run();

                        this.logger.info(
                            {
                                job: "daily-digest",
                                ...result,
                                cronExpression: this.options.cronExpression,
                            },
                            "Daily digest pass completed",
                        );
                    } catch (error) {
                        this.logger.error(
                            { job: "daily-digest", error },
                            "Daily digest pass failed",
                        );
                    } finally {
                        this.running = false;
                    }
                })();
            },
            { timezone: this.options.timezone },
        );

        this.logger.info("Daily Digest Scheduler initialized");
    }

    /**
     * Stops the schedule.
     *
     * Destroys the task rather than only dropping the reference, for the
     * reason the media moderation scheduler records: a schedule left running
     * past `onClose` fires against a disconnected Prisma client.
     */
    async stop(): Promise<void> {
        if (!this.task) return;

        const task = this.task;
        this.task = undefined;

        await task.destroy();
    }
}
