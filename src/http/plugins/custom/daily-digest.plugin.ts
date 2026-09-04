import type { FastifyInstance } from "fastify";
import fastifyPlugin from "fastify-plugin";

function dailyDigestPlugin(fastify: FastifyInstance): void {
    const dailyDigestScheduler =
        fastify.diContainer.cradle.dailyDigestScheduler;

    fastify.addHook("onReady", () => {
        dailyDigestScheduler.start();

        fastify.log.info(
            {
                context: "SystemScheduler",
                jobName: "DailyDigest",
                status: fastify.config.DAILY_DIGEST_ENABLED
                    ? "Started"
                    : "Disabled",
                config: {
                    cronExpression: fastify.config.DAILY_DIGEST_CRON,
                    timezone: fastify.config.DAILY_DIGEST_TIMEZONE,
                    windowHours: fastify.config.DAILY_DIGEST_WINDOW_HOURS,
                },
            },
            "Daily digest scheduler initialized.",
        );
    });

    fastify.addHook("onClose", async () => {
        await dailyDigestScheduler.stop();

        fastify.log.info(
            {
                context: "SystemScheduler",
                jobName: "DailyDigest",
                status: "Stopped",
            },
            "Daily digest scheduler stopped safely.",
        );
    });
}

export default fastifyPlugin(dailyDigestPlugin, {
    name: "daily-digest-plugin",
    dependencies: ["di-plugin", "prisma-plugin", "env-plugin"],
});
