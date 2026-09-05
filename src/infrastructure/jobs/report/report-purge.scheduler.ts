import type { FastifyBaseLogger } from "fastify";
import cron, { type ScheduledTask } from "node-cron";
import type { ReportPurgeJob } from "./report-purge.job";

export interface ReportPurgeSchedulerOptions {
    cronExpression: string;
    retentionDays: number;
}

/**
 * Drops aged-out reports on a cron schedule.
 *
 * Passes no timezone, like the other purges: which hour of the container's
 * local day this runs in changes nothing.
 */
export class ReportPurgeScheduler {
    private task?: ScheduledTask;

    /**
     * Creates a new instance of ReportPurgeScheduler.
     *
     * @param job - The job to run on each tick
     * @param options - Schedule and retention window
     * @param logger - Fastify logger
     */
    constructor(
        private readonly job: ReportPurgeJob,
        private readonly options: ReportPurgeSchedulerOptions,
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
                            job: "report-purge",
                            deletedCount,
                            cronExpression: this.options.cronExpression,
                            retentionDays: this.options.retentionDays,
                        },
                        "Report purge completed successfully",
                    );
                } catch (error) {
                    this.logger.error(
                        { job: "report-purge", error },
                        "Report purge failed",
                    );
                }
            })();
        });

        this.logger.info("Report Purge Scheduler initialized");
    }

    /**
     * Stops the schedule.
     */
    stop(): void {
        if (!this.task) return;
        this.task = undefined;
    }
}
