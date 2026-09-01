import type { FastifyBaseLogger } from "fastify";
import cron, { type ScheduledTask } from "node-cron";
import type { MediaModerationJob } from "./media-moderation.job";

export interface MediaModerationSchedulerOptions {
    cronExpression: string;
}

/**
 * Runs the video moderation job on a cron schedule.
 *
 * Ticks far more often than the purge jobs do, because what it clears is a
 * user waiting to see their own post: a video that takes an hour to appear
 * reads as a broken upload rather than as a check in progress.
 */
export class MediaModerationScheduler {
    private task?: ScheduledTask;

    /**
     * Creates a new instance of MediaModerationScheduler.
     *
     * @param job - The job to run on each tick
     * @param options - The cron expression to run it on
     * @param logger - Fastify logger
     */
    constructor(
        private readonly job: MediaModerationJob,
        private readonly options: MediaModerationSchedulerOptions,
        private readonly logger: FastifyBaseLogger,
    ) {}

    /**
     * Starts the schedule. Calling it twice is a no-op.
     */
    start(): void {
        if (this.task) return;

        this.task = cron.schedule(this.options.cronExpression, () => {
            void (async (): Promise<void> => {
                try {
                    const result = await this.job.run();

                    // A tick that found nothing is the normal case and would
                    // otherwise fill the log every minute.
                    if (result.scanned === 0) return;

                    this.logger.info(
                        {
                            job: "media-moderation",
                            ...result,
                            cronExpression: this.options.cronExpression,
                        },
                        "Media moderation pass completed",
                    );
                } catch (error) {
                    this.logger.error(
                        {
                            job: "media-moderation",
                            error,
                        },
                        "Media moderation pass failed",
                    );
                }
            })();
        });

        this.logger.info("Media Moderation Scheduler initialized");
    }

    /**
     * Stops the schedule.
     *
     * Destroys the task rather than only dropping the reference. This one
     * ticks every minute, so a schedule left running past `onClose` fires
     * against a disconnected Prisma client - and does so inside every E2E run.
     */
    async stop(): Promise<void> {
        if (!this.task) return;

        const task = this.task;
        this.task = undefined;

        await task.destroy();
    }
}
