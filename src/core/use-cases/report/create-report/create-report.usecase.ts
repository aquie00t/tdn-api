import { BadRequestError, NotFoundError } from "@core/errors";
import { Report } from "@core/domain/entities/report.entity";
import { ReportTargetKind } from "@core/domain/enums";
import type { ICommentRepository } from "@core/ports/repositories/comment.repository";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { IReportRepository } from "@core/ports/repositories/report.repository";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { EmailPort } from "@core/ports/services/email.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import { groupReports } from "@core/use-cases/shared/reports/group-reports";
import type { CreateReportConfig } from "./create-report.config";
import type { CreateReportUseCaseInput } from "./create-report-usecase.input";
import type { CreateReportUseCaseOutput } from "./create-report-usecase.output";

/**
 * What the use case needs from whichever kind of content was reported.
 */
interface ReportTarget {
    authorId: string;
    content: string;
    mediaKeys: string[];

    /** The post a comment lives under, when it lives under one. */
    parentId: string | null;
}

/**
 * Use case for reporting a post or a comment.
 *
 * The report is stored with a copy of what was reported - the author and the
 * text as they stand right now - because the quickest response available to a
 * reported account is to delete the post, and a queue that empties itself when
 * that happens is not a moderation record.
 *
 * Nothing is hidden as a result of this call. Reports inform a person; they do
 * not act on their own, which is the only design that survives a group of
 * accounts reporting something they merely disagree with.
 */
export class CreateReportUseCase {
    /**
     * Creates a new instance of CreateReportUseCase.
     *
     * @param reportRepository - Where reports are stored
     * @param postRepository - Used to resolve a reported post
     * @param commentRepository - Used to resolve a reported comment
     * @param userRepository - Used to name the author in an alert
     * @param emailService - Carries the escalation alert
     * @param createReportConfig - Threshold, operator address and email caps
     * @param logger - Records an alert that could not be sent
     */
    constructor(
        private readonly reportRepository: IReportRepository,
        private readonly postRepository: IPostRepository,
        private readonly commentRepository: ICommentRepository,
        private readonly userRepository: IUserRepository,
        private readonly emailService: EmailPort,
        private readonly createReportConfig: CreateReportConfig,
        private readonly logger: LoggerPort,
    ) {}

    /**
     * Files a report against a post or a comment.
     *
     * Idempotent per person: reporting the same thing twice reports the row
     * that is already there rather than failing, which is what a double tap
     * and a retry both need.
     *
     * @param input - Who is reporting what, and why
     * @returns Whether this call is what filed it
     *
     * @throws NotFoundError - When the content does not exist
     * @throws BadRequestError - When somebody reports their own content
     *
     * @remarks
     * The escalation email is dispatched fire-and-forget, the way the
     * notification fan-outs are. A reporter should not wait on a mail provider
     * to be told their report was received, and a provider outage must not
     * turn into a failed report - the row is already committed by then, and
     * the morning summary reads the queue rather than the alerts.
     */
    async execute(
        input: CreateReportUseCaseInput,
    ): Promise<CreateReportUseCaseOutput> {
        const { currentUserId, targetKind, targetId, reason, details } = input;

        const target = await this.resolveTarget(targetKind, targetId);

        if (!target) throw new NotFoundError("Content not found.");

        if (target.authorId === currentUserId)
            throw new BadRequestError("You cannot report your own content.");

        const stored = await this.reportRepository.create(
            Report.create({
                reporterId: currentUserId,
                targetKind,
                targetId,
                targetParentId: target.parentId,
                targetAuthorId: target.authorId,
                reason,
                details: details ?? null,
                contentSnapshot: target.content,
                mediaKeys: target.mediaKeys,
            }),
        );

        if (!stored) return { created: false };

        void this.alertIfEscalated(stored);

        return { created: true };
    }

    /**
     * Reads whichever kind of content was reported.
     *
     * @param targetKind - Post or comment
     * @param targetId - The content's id
     * @returns What the report needs to copy, or null when it is gone
     */
    private async resolveTarget(
        targetKind: ReportTargetKind,
        targetId: string,
    ): Promise<ReportTarget | null> {
        if (targetKind === ReportTargetKind.POST) {
            const post = await this.postRepository.findById(targetId);

            if (!post) return null;

            return {
                authorId: post.author.id,
                content: post.content,
                mediaKeys: post.mediaUrls,
                parentId: null,
            };
        }

        const comment = await this.commentRepository.findById(targetId);

        if (!comment) return null;

        return {
            authorId: comment.authorId,
            content: comment.content,
            mediaKeys: comment.mediaUrls,
            // Null for a comment on an article: the report row stores post ids
            // only, and an article is addressed by slug.
            parentId: comment.postId,
        };
    }

    /**
     * Mails the operator when this report is the one that crossed the
     * threshold.
     *
     * Compared with `===` rather than `>=` so the alert fires once per piece
     * of content instead of on every report after the third. Two reports
     * landing at the same instant can still read the same count and send two
     * alerts; a duplicate email is a far better failure than a queue that
     * never says anything.
     *
     * @param report - The report that was just filed
     */
    private async alertIfEscalated(report: Report): Promise<void> {
        const { alertEmail, alertThreshold } = this.createReportConfig;

        if (!alertEmail) return;

        try {
            const reporters =
                await this.reportRepository.countDistinctReporters(
                    report.targetKind,
                    report.targetId,
                );

            if (reporters !== alertThreshold) return;

            const author = await this.userRepository.findById(
                report.targetAuthorId,
            );

            const [item] = groupReports([report], {
                usernames: new Map(
                    author ? [[author.id, author.username]] : [],
                ),
                frontendUrl: this.createReportConfig.frontendUrl,
                excerptLength: this.createReportConfig.excerptLength,
                maxDetails: this.createReportConfig.maxDetails,
            });

            if (!item) return;

            await this.emailService.sendReportAlert({
                to: alertEmail,
                // The grouping saw one row; the count that matters is the
                // number of people, which the repository just answered.
                item: { ...item, reporterCount: reporters },
                threshold: alertThreshold,
            });
        } catch (error: unknown) {
            this.logger.error(
                { err: error, reportId: report.id },
                "Failed to send a report escalation alert",
            );
        }
    }
}
