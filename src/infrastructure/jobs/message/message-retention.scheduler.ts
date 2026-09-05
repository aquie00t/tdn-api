import type { FastifyBaseLogger } from "fastify";
import cron, { type ScheduledTask } from "node-cron";
import type { MessageRetentionJob } from "./message-retention.job";

export interface MessageRetentionSchedulerOptions {
    cronExpression: string;
    retentionDays: number;
}

/**
 * Runs the message retention purge on a cron schedule.
 *
 * No timezone, like the other purges and unlike the daily digest: this deletes
 * history rather than landing in anybody's morning, so the container's clock is
 * as good an hour as any.
 */
export class MessageRetentionScheduler {
    private task?: ScheduledTask;

    /**
     * True while a pass is in flight.
     *
     * node-cron does not await the callback. A first run against a long history
     * can outlive its own interval, and a second pass starting on top of it
     * would read the same expired rows the first is still deleting - both would
     * try to delete the same media and one would log failures for objects the
     * other had already removed.
     */
    private running = false;

    /**
     * Creates a new instance of MessageRetentionScheduler.
     *
     * @param job - The job to run on each tick
     * @param options - Schedule and retention window
     * @param logger - Fastify logger
     */
    constructor(
        private readonly job: MessageRetentionJob,
        private readonly options: MessageRetentionSchedulerOptions,
        private readonly logger: FastifyBaseLogger,
    ) {}

    /**
     * Starts the schedule. Calling it twice is a no-op.
     */
    start(): void {
        if (this.task) return;

        this.task = cron.schedule(this.options.cronExpression, () => {
            void (async (): Promise<void> => {
                if (this.running) {
                    this.logger.warn(
                        { job: "message-retention" },
                        "Skipping a message retention tick: the previous pass is still running",
                    );
                    return;
                }

                this.running = true;

                try {
                    const result = await this.job.run(
                        this.options.retentionDays,
                    );

                    this.logger.info(
                        {
                            job: "message-retention",
                            ...result,
                            cronExpression: this.options.cronExpression,
                            retentionDays: this.options.retentionDays,
                        },
                        "Message retention pass completed",
                    );
                } catch (error) {
                    this.logger.error(
                        { job: "message-retention", error },
                        "Message retention pass failed",
                    );
                } finally {
                    this.running = false;
                }
            })();
        });

        this.logger.info("Message Retention Scheduler initialized");
    }

    /**
     * Stops the schedule.
     *
     * Destroys the task rather than dropping the reference: node-cron keeps
     * running a task nobody holds, so forgetting it would leave a purge firing
     * against a closing process.
     */
    async stop(): Promise<void> {
        if (!this.task) return;

        const task = this.task;
        this.task = undefined;

        await task.destroy();
    }
}
