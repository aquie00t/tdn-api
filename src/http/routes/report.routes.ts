/**
 * Report routes module
 *
 * One endpoint: reporting a post or a comment. There is no read side, and that
 * is deliberate - serving the queue would turn the moderation backlog into a
 * public list of what an account has been accused of. The operator reads it
 * from the database, the way a ban is applied.
 *
 * SENSITIVE rather than STANDARD, for the reason blocking is: reporting is a
 * deliberate, one-at-a-time act, so 5/min is far above what a person doing it
 * on purpose needs and well below what makes the operator's inbox a target.
 *
 * @author TDN Team
 * @version 1.0.0
 */

import { RateLimitPolicies } from "@plugins/rate-limit.plugin";
import {
    type CreateReportBody,
    CreateReportBodySchema,
    CreateReportResponseSchema,
} from "@typings/schemas/report/report.schema";
import type { FastifyInstance } from "fastify";

/**
 * Sets up the report routes on the Fastify instance.
 *
 * @param fastify - The Fastify application instance
 * @returns void
 */
export default function reportRoutes(fastify: FastifyInstance): void {
    const reportController = fastify.diContainer.cradle.reportController;

    fastify.post<{ Body: CreateReportBody }>(
        "/reports",
        {
            schema: {
                body: CreateReportBodySchema,
                response: { 200: CreateReportResponseSchema },
                tags: ["Report"],
            },
            onRequest: [fastify.authenticate],
            config: { rateLimit: RateLimitPolicies.SENSITIVE },
        },
        reportController.create.bind(reportController),
    );
}
