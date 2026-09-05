import type { FastifyInstance } from "fastify";
import fastifyPlugin from "fastify-plugin";

function messageRetentionPlugin(fastify: FastifyInstance): void {
    const messageRetentionScheduler =
        fastify.diContainer.cradle.messageRetentionScheduler;

    fastify.addHook("onReady", () => {
        messageRetentionScheduler.start();

        fastify.log.info(
            {
                context: "SystemScheduler",
                jobName: "MessageRetention",
                status: "Started",
                config: {
                    cronExpression: fastify.config.MESSAGE_RETENTION_CRON,
                    retentionDays: fastify.config.MESSAGE_RETENTION_DAYS,
                },
            },
            "Message retention scheduler initialized and started successfully.",
        );
    });

    fastify.addHook("onClose", async () => {
        await messageRetentionScheduler.stop();

        fastify.log.info(
            {
                context: "SystemScheduler",
                jobName: "MessageRetention",
                status: "Stopped",
            },
            "Message retention scheduler stopped safely.",
        );
    });
}

export default fastifyPlugin(messageRetentionPlugin, {
    name: "message-retention-plugin",
    dependencies: ["di-plugin", "prisma-plugin", "env-plugin"],
});
