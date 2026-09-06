import type { FastifyInstance } from "fastify";
import fastifyPlugin from "fastify-plugin";

function subscriptionReconcilePlugin(fastify: FastifyInstance): void {
    const subscriptionReconcileScheduler =
        fastify.diContainer.cradle.subscriptionReconcileScheduler;

    fastify.addHook("onReady", () => {
        subscriptionReconcileScheduler.start();

        fastify.log.info(
            {
                context: "SystemScheduler",
                jobName: "SubscriptionReconcile",
                status: "Started",
                config: {
                    cronExpression: fastify.config.SUBSCRIPTION_RECONCILE_CRON,
                    batchSize: fastify.config.SUBSCRIPTION_RECONCILE_BATCH_SIZE,
                },
            },
            "Subscription reconcile scheduler initialized.",
        );
    });

    fastify.addHook("onClose", async () => {
        await subscriptionReconcileScheduler.stop();

        fastify.log.info(
            {
                context: "SystemScheduler",
                jobName: "SubscriptionReconcile",
                status: "Stopped",
            },
            "Subscription reconcile scheduler stopped safely.",
        );
    });
}

export default fastifyPlugin(subscriptionReconcilePlugin, {
    name: "subscription-reconcile-plugin",
    dependencies: ["di-plugin", "prisma-plugin", "env-plugin"],
});
