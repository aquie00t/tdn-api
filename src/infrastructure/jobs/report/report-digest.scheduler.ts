import type { FastifyBaseLogger } from "fastify";
import cron, { type ScheduledTask } from "node-cron";
import type { ReportDigestJob } from "./report-digest.job";

export interface ReportDigestSchedulerOptions {
    cronExpression: string;

    /**
     * Timezone the cron expression is read in.
     *
     * Pinned for the reason the daily digest pins one: the summary has to land
     * at the start of the operator's day, not at whatever hour the container
     * happens to think it is.
     */
    timezone: string;

    /** When false the schedule is never started. */
    enabled: boolean;
}

/**
 * Runs the morning report summary on a cron schedule.
 */
export class ReportDigestScheduler {
    private task?: ScheduledTask;

    /**
     * True while a pass is in flight.
     *
     * node-cron does not await the callback. The per-day claim would stop a
     * second pass mailing anybody, but two passes reading the same queue is
     * still work for nothing.
     */
    private running = false;

    /**
     * Creates a new instance of ReportDigestScheduler.
     *
     * @param job - The job to run on each tick
     * @param options - Schedule, timezone and the feature switch
     * @param logger - Fastify logger
     */
    constructor(
        private readonly job: ReportDigestJob,
        private readonly options: ReportDigestSchedulerOptions,
        private readonly logger: FastifyBaseLogger,
    ) {}

    /**
     * Starts the schedule. Calling it twice is a no-op.
     */
    start(): void {
        if (this.task) return;

        if (!this.options.enabled) {
            this.logger.info(
                { job: "report-digest" },
                "Report digest is disabled; no schedule started",
            );
            return;
        }

        this.task = cron.schedule(
            this.options.cronExpression,
            () => {
                void (async (): Promise<void> => {
                    if (this.running) {
                        this.logger.warn(
                            { job: "report-digest" },
                            "Skipping a report digest tick: the previous pass is still running",
                        );
                        return;
                    }

                    this.running = true;

                    try {
                        const result = await this.job.run();

                        this.logger.info(
                            {
                                job: "report-digest",
                                ...result,
                                cronExpression: this.options.cronExpression,
                            },
                            "Report digest pass completed",
                        );
                    } catch (error) {
                        this.logger.error(
                            { job: "report-digest", error },
                            "Report digest pass failed",
                        );
                    } finally {
                        this.running = false;
                    }
                })();
            },
            { timezone: this.options.timezone },
        );

        this.logger.info("Report Digest Scheduler initialized");
    }

    /**
     * Stops the schedule.
     *
     * Destroys the task rather than only dropping the reference: a schedule
     * left running past `onClose` fires against a disconnected Prisma client.
     */
    async stop(): Promise<void> {
        if (!this.task) return;

        const task = this.task;
        this.task = undefined;

        await task.destroy();
    }
}
