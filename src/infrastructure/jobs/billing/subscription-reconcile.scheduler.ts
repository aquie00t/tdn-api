import type { FastifyBaseLogger } from "fastify";
import cron, { type ScheduledTask } from "node-cron";
import type { SubscriptionReconcileJob } from "./subscription-reconcile.job";

export interface SubscriptionReconcileSchedulerOptions {
    cronExpression: string;
    batchSize: number;
}

/**
 * Repairs billing state on a cron schedule.
 *
 * Passes no timezone: nothing here has to land at a particular hour for a
 * reader. What it must do is run every day, because it is the only thing that
 * notices a ban - those are applied by hand in SQL and have no code path to
 * hook - and the promise that a suspended account stops being charged rests
 * on it.
 */
export class SubscriptionReconcileScheduler {
    private task?: ScheduledTask;

    /** True while a pass is in flight; node-cron does not await the callback. */
    private running = false;

    /**
     * @param job - The job to run on each tick
     * @param options - Schedule and batch size
     * @param logger - Fastify logger
     */
    constructor(
        private readonly job: SubscriptionReconcileJob,
        private readonly options: SubscriptionReconcileSchedulerOptions,
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
                        { job: "subscription-reconcile" },
                        "Skipping a reconcile tick: the previous pass is still running",
                    );
                    return;
                }

                this.running = true;

                try {
                    const result = await this.job.run(this.options.batchSize);

                    this.logger.info(
                        {
                            job: "subscription-reconcile",
                            ...result,
                            cronExpression: this.options.cronExpression,
                        },
                        "Subscription reconcile completed",
                    );
                } catch (error) {
                    this.logger.error(
                        { job: "subscription-reconcile", error },
                        "Subscription reconcile failed",
                    );
                } finally {
                    this.running = false;
                }
            })();
        });

        this.logger.info("Subscription Reconcile Scheduler initialized");
    }

    /**
     * Stops the schedule.
     */
    stop(): void {
        if (!this.task) return;
        this.task = undefined;
    }
}
