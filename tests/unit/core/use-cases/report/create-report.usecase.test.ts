import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateReportUseCase } from "@core/use-cases/report/create-report";
import { Report } from "@core/domain/entities/report.entity";
import { ReportReason, ReportTargetKind } from "@core/domain/enums";
import type { ICommentRepository } from "@core/ports/repositories/comment.repository";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { IReportRepository } from "@core/ports/repositories/report.repository";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { EmailPort } from "@core/ports/services/email.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import { BadRequestError, NotFoundError } from "@core/errors";
import {
    buildComment,
    buildPost,
    buildUser,
} from "../../../helpers/mock-factories";

const REPORTER = "reporter-1";
const AUTHOR = "user-1";

const CONFIG = {
    alertThreshold: 3,
    alertEmail: "moderation@tdn.example",
    frontendUrl: "https://tdn.example",
    excerptLength: 120,
    maxDetails: 3,
};

/**
 * The stored row a repository hands back, which the alert path reads.
 */
function storedReport(overrides: Partial<{ targetId: string }> = {}): Report {
    return Report.with({
        id: "report-1",
        reporterId: REPORTER,
        targetKind: ReportTargetKind.POST,
        targetId: overrides.targetId ?? "post-1",
        targetParentId: null,
        targetAuthorId: AUTHOR,
        reason: ReportReason.SPAM,
        details: null,
        contentSnapshot: "Test post content",
        mediaKeys: [],
        status: "PENDING" as never,
        createdAt: new Date("2026-01-01T10:00:00Z"),
    });
}

describe("CreateReportUseCase", () => {
    let useCase: CreateReportUseCase;
    let reportRepository: Pick<
        IReportRepository,
        "create" | "countDistinctReporters"
    >;
    let postRepository: Pick<IPostRepository, "findById">;
    let commentRepository: Pick<ICommentRepository, "findById">;
    let userRepository: Pick<IUserRepository, "findById">;
    let emailService: Pick<EmailPort, "sendReportAlert">;
    let logger: LoggerPort;

    beforeEach(() => {
        reportRepository = {
            create: vi.fn().mockResolvedValue(storedReport()),
            countDistinctReporters: vi.fn().mockResolvedValue(1),
        };

        postRepository = {
            findById: vi.fn().mockResolvedValue(buildPost()),
        };

        commentRepository = {
            findById: vi.fn().mockResolvedValue(buildComment()),
        };

        userRepository = {
            findById: vi
                .fn()
                .mockResolvedValue(buildUser({ id: AUTHOR })),
        };

        emailService = { sendReportAlert: vi.fn().mockResolvedValue(undefined) };

        logger = {
            error: vi.fn(),
            warn: vi.fn(),
            info: vi.fn(),
        } as unknown as LoggerPort;

        useCase = new CreateReportUseCase(
            reportRepository as IReportRepository,
            postRepository as IPostRepository,
            commentRepository as ICommentRepository,
            userRepository as IUserRepository,
            emailService as EmailPort,
            CONFIG,
            logger,
        );
    });

    const input = {
        currentUserId: REPORTER,
        targetKind: ReportTargetKind.POST,
        targetId: "post-1",
        reason: ReportReason.SPAM,
    };

    it("should store a copy of the reported content rather than a pointer", async () => {
        await useCase.execute({ ...input, details: "spam link" });

        const stored = vi.mocked(reportRepository.create).mock
            .calls[0]![0] as Report;

        expect(stored.contentSnapshot).toBe("Test post content");
        expect(stored.targetAuthorId).toBe(AUTHOR);
        expect(stored.details).toBe("spam link");
        expect(stored.isOpen()).toBe(true);
    });

    it("should record the parent post when a comment is reported", async () => {
        await useCase.execute({
            ...input,
            targetKind: ReportTargetKind.COMMENT,
            targetId: "comment-1",
        });

        const stored = vi.mocked(reportRepository.create).mock
            .calls[0]![0] as Report;

        expect(stored.targetParentId).toBe("post-1");
    });

    it("should leave the parent null for a comment on an article", async () => {
        vi.mocked(commentRepository.findById).mockResolvedValue(
            buildComment({ postId: null, articleId: "article-1" }),
        );

        await useCase.execute({
            ...input,
            targetKind: ReportTargetKind.COMMENT,
            targetId: "comment-1",
        });

        const stored = vi.mocked(reportRepository.create).mock
            .calls[0]![0] as Report;

        expect(stored.targetParentId).toBeNull();
    });

    it("should throw NotFoundError when the content is gone", async () => {
        vi.mocked(postRepository.findById).mockResolvedValue(null);

        await expect(useCase.execute(input)).rejects.toThrow(NotFoundError);
        expect(reportRepository.create).not.toHaveBeenCalled();
    });

    it("should throw BadRequestError when somebody reports their own content", async () => {
        await expect(
            useCase.execute({ ...input, currentUserId: AUTHOR }),
        ).rejects.toThrow(BadRequestError);

        expect(reportRepository.create).not.toHaveBeenCalled();
    });

    it("should report a repeat as not created rather than failing", async () => {
        vi.mocked(reportRepository.create).mockResolvedValue(null);

        await expect(useCase.execute(input)).resolves.toEqual({
            created: false,
        });

        expect(emailService.sendReportAlert).not.toHaveBeenCalled();
    });

    it("should alert exactly when the threshold is crossed", async () => {
        vi.mocked(reportRepository.countDistinctReporters).mockResolvedValue(3);

        await useCase.execute(input);
        await vi.waitFor(() =>
            expect(emailService.sendReportAlert).toHaveBeenCalledTimes(1),
        );

        const sent = vi.mocked(emailService.sendReportAlert).mock.calls[0]![0];

        expect(sent.to).toBe(CONFIG.alertEmail);
        expect(sent.threshold).toBe(3);
        expect(sent.item.reporterCount).toBe(3);
        expect(sent.item.authorUsername).toBe("testuser");
    });

    it("should stay quiet below the threshold and after it", async () => {
        vi.mocked(reportRepository.countDistinctReporters).mockResolvedValue(2);
        await useCase.execute(input);

        vi.mocked(reportRepository.countDistinctReporters).mockResolvedValue(4);
        await useCase.execute(input);

        await new Promise((resolve) => setImmediate(resolve));

        expect(emailService.sendReportAlert).not.toHaveBeenCalled();
    });

    it("should not alert when no operator address is configured", async () => {
        vi.mocked(reportRepository.countDistinctReporters).mockResolvedValue(3);

        const quiet = new CreateReportUseCase(
            reportRepository as IReportRepository,
            postRepository as IPostRepository,
            commentRepository as ICommentRepository,
            userRepository as IUserRepository,
            emailService as EmailPort,
            { ...CONFIG, alertEmail: "" },
            logger,
        );

        await quiet.execute(input);
        await new Promise((resolve) => setImmediate(resolve));

        expect(emailService.sendReportAlert).not.toHaveBeenCalled();
        expect(reportRepository.countDistinctReporters).not.toHaveBeenCalled();
    });

    it("should still file the report when the alert cannot be sent", async () => {
        vi.mocked(reportRepository.countDistinctReporters).mockResolvedValue(3);
        vi.mocked(emailService.sendReportAlert).mockRejectedValue(
            new Error("provider down"),
        );

        await expect(useCase.execute(input)).resolves.toEqual({
            created: true,
        });

        await vi.waitFor(() => expect(logger.error).toHaveBeenCalled());
    });
});
