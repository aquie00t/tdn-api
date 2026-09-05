import type { FastifyBaseLogger } from "fastify";
import cron, { type ScheduledTask } from "node-cron";
import type { DevicePurgeJob } from "./device-purge.job";

export interface DevicePurgeSchedulerOptions {
    cronExpression: string;
    retentionDays: number;
}

/**
 * Drops abandoned push registrations on a cron schedule.
 *
 * Passes no timezone, like the other purges: which hour of the container's
 * local day this runs in changes nothing.
 */
export class DevicePurgeScheduler {
    private task?: ScheduledTask;

    /**
     * @param job - The job to run on each tick
     * @param options - Schedule and retention window
     * @param logger - Fastify logger
     */
    constructor(
        private readonly job: DevicePurgeJob,
        private readonly options: DevicePurgeSchedulerOptions,
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
                    const deletedCount = await this.job.run(
                        this.options.retentionDays,
                    );

                    this.logger.info(
                        {
                            job: "device-purge",
                            deletedCount,
                            cronExpression: this.options.cronExpression,
                            retentionDays: this.options.retentionDays,
                        },
                        "Device purge completed successfully",
                    );
                } catch (error) {
                    this.logger.error(
                        { job: "device-purge", error },
                        "Device purge failed",
                    );
                }
            })();
        });

        this.logger.info("Device Purge Scheduler initialized");
    }

    /**
     * Stops the schedule.
     */
    stop(): void {
        if (!this.task) return;
        this.task = undefined;
    }
}
