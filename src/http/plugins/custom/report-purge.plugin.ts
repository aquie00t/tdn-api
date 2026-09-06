import type { FastifyInstance } from "fastify";
import fastifyPlugin from "fastify-plugin";

function reportPurgePlugin(fastify: FastifyInstance): void {
    const reportPurgeScheduler =
        fastify.diContainer.cradle.reportPurgeScheduler;

    fastify.addHook("onReady", () => {
        reportPurgeScheduler.start();

        fastify.log.info(
            {
                context: "SystemScheduler",
                jobName: "ReportPurge",
                status: "Started",
                config: {
                    cronExpression: fastify.config.REPORT_PURGE_CRON,
                    retentionDays: fastify.config.REPORT_RETENTION_DAYS,
                },
            },
            "Report purge scheduler initialized.",
        );
    });

    fastify.addHook("onClose", async () => {
        await reportPurgeScheduler.stop();

        fastify.log.info(
            {
                context: "SystemScheduler",
                jobName: "ReportPurge",
                status: "Stopped",
            },
            "Report purge scheduler stopped safely.",
        );
    });
}

export default fastifyPlugin(reportPurgePlugin, {
    name: "report-purge-plugin",
    dependencies: ["di-plugin", "prisma-plugin", "env-plugin"],
});
