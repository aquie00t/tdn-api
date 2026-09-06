import type { FastifyInstance } from "fastify";
import fastifyPlugin from "fastify-plugin";

function devicePurgePlugin(fastify: FastifyInstance): void {
    const devicePurgeScheduler =
        fastify.diContainer.cradle.devicePurgeScheduler;

    fastify.addHook("onReady", () => {
        devicePurgeScheduler.start();

        fastify.log.info(
            {
                context: "SystemScheduler",
                jobName: "DevicePurge",
                status: "Started",
                config: {
                    cronExpression: fastify.config.DEVICE_PURGE_CRON,
                    retentionDays: fastify.config.DEVICE_RETENTION_DAYS,
                },
            },
            "Device purge scheduler initialized.",
        );
    });

    fastify.addHook("onClose", async () => {
        await devicePurgeScheduler.stop();

        fastify.log.info(
            {
                context: "SystemScheduler",
                jobName: "DevicePurge",
                status: "Stopped",
            },
            "Device purge scheduler stopped safely.",
        );
    });
}

export default fastifyPlugin(devicePurgePlugin, {
    name: "device-purge-plugin",
    dependencies: ["di-plugin", "prisma-plugin", "env-plugin"],
});
