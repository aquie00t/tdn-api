import type { FastifyInstance } from "fastify";
import fastifyPlugin from "fastify-plugin";

function reportDigestPlugin(fastify: FastifyInstance): void {
    const reportDigestScheduler =
        fastify.diContainer.cradle.reportDigestScheduler;

    fastify.addHook("onReady", () => {
        reportDigestScheduler.start();

        fastify.log.info(
            {
                context: "SystemScheduler",
                jobName: "ReportDigest",
                status: fastify.config.REPORT_DIGEST_ENABLED
                    ? "Started"
                    : "Disabled",
                config: {
                    cronExpression: fastify.config.REPORT_DIGEST_CRON,
                    timezone: fastify.config.REPORT_DIGEST_TIMEZONE,
                    maxReports: fastify.config.REPORT_DIGEST_MAX_REPORTS,
                },
            },
            "Report digest scheduler initialized.",
        );
    });

    fastify.addHook("onClose", async () => {
        await reportDigestScheduler.stop();

        fastify.log.info(
            {
                context: "SystemScheduler",
                jobName: "ReportDigest",
                status: "Stopped",
            },
            "Report digest scheduler stopped safely.",
        );
    });
}

export default fastifyPlugin(reportDigestPlugin, {
    name: "report-digest-plugin",
    dependencies: ["di-plugin", "prisma-plugin", "env-plugin"],
});
