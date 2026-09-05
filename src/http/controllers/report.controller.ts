import type { CreateReportUseCase } from "@core/use-cases/report/create-report";
import type { CreateReportBody } from "@typings/schemas/report/report.schema";
import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * Controller for the content report endpoint.
 */
export class ReportController {
    /**
     * Creates a new ReportController instance.
     *
     * @param createReportUseCase - Use case that files a report
     */
    constructor(private readonly createReportUseCase: CreateReportUseCase) {}

    /**
     * Files a report against a post or a comment.
     *
     * Answers the same way whether this call filed the report or found one
     * this person had already filed. The difference is real - the use case
     * reports it - but telling the client would turn the endpoint into a way
     * of asking what the moderation queue knows.
     *
     * @param request - The request, carrying the target and reason in its body
     * @param reply - The reply to send
     */
    async create(
        request: FastifyRequest<{ Body: CreateReportBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        const { targetKind, targetId, reason, details } = request.body;
        const currentUserId = request.user!.id;

        await this.createReportUseCase.execute({
            currentUserId,
            targetKind,
            targetId,
            reason,
            details,
        });

        reply.status(200).send({
            data: { received: true },
            meta: { timestamp: new Date().toISOString() },
        });
    }
}
