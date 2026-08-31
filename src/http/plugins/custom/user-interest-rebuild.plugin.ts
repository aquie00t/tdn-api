import type { FastifyInstance } from "fastify";
import fastifyPlugin from "fastify-plugin";

function userInterestRebuildPlugin(fastify: FastifyInstance): void {
    const scheduler = fastify.diContainer.cradle.userInterestRebuildScheduler;

    fastify.addHook("onReady", () => {
        scheduler.start();

        fastify.log.info(
            {
                context: "SystemScheduler",
                jobName: "UserInterestRebuild",
                status: "Started",
                config: {
                    cronExpression: fastify.config.USER_INTEREST_REBUILD_CRON,
                    windowDays: fastify.config.USER_INTEREST_WINDOW_DAYS,
                },
            },
            "User interest rebuild scheduler initialized and started successfully.",
        );
    });

    fastify.addHook("onClose", () => {
        scheduler.stop();

        fastify.log.info(
            {
                context: "SystemScheduler",
                jobName: "UserInterestRebuild",
                status: "Stopped",
            },
            "User interest rebuild scheduler stopped safely.",
        );
    });
}

export default fastifyPlugin(userInterestRebuildPlugin, {
    name: "user-interest-rebuild-plugin",
    dependencies: ["di-plugin", "prisma-plugin", "env-plugin"],
});
