import type { FastifyInstance } from "fastify";
import fastifyPlugin from "fastify-plugin";

function mediaModerationPlugin(fastify: FastifyInstance): void {
    const mediaModerationScheduler =
        fastify.diContainer.cradle.mediaModerationScheduler;

    fastify.addHook("onReady", () => {
        mediaModerationScheduler.start();

        fastify.log.info(
            {
                context: "SystemScheduler",
                jobName: "MediaModeration",
                status: "Started",
                config: {
                    cronExpression: fastify.config.MEDIA_MODERATION_CRON,
                    batchSize: fastify.config.MEDIA_MODERATION_BATCH_SIZE,
                    maxAttempts: fastify.config.MEDIA_MODERATION_MAX_ATTEMPTS,
                    moderationEnabled: fastify.config.MODERATION_ENABLED,
                },
            },
            "Media moderation scheduler initialized and started successfully.",
        );
    });

    fastify.addHook("onClose", async () => {
        await mediaModerationScheduler.stop();

        fastify.log.info(
            {
                context: "SystemScheduler",
                jobName: "MediaModeration",
                status: "Stopped",
            },
            "Media moderation scheduler stopped safely.",
        );
    });
}

export default fastifyPlugin(mediaModerationPlugin, {
    name: "media-moderation-plugin",
    dependencies: ["di-plugin", "prisma-plugin", "env-plugin"],
});
