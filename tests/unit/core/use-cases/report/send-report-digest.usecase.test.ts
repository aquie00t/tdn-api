import { beforeEach, describe, expect, it, vi } from "vitest";
import { SendReportDigestUseCase } from "@core/use-cases/report/send-report-digest";
import { Report } from "@core/domain/entities/report.entity";
import { ReportReason, ReportTargetKind } from "@core/domain/enums";
import type { IReportDigestDeliveryRepository } from "@core/ports/repositories/report-digest-delivery.repository";
import type { IReportRepository } from "@core/ports/repositories/report.repository";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { EmailPort } from "@core/ports/services/email.port";
import { buildUser } from "../../../helpers/mock-factories";

const CONFIG = {
    enabled: true,
    alertEmail: "moderation@tdn.example",
    maxReports: 50,
    frontendUrl: "https://tdn.example",
    excerptLength: 120,
    maxDetails: 3,
    timezone: "Europe/Istanbul",
};

/**
 * A stored, still-open report.
 */
function openReport(reporterId: string, targetId = "post-1"): Report {
    return Report.with({
        id: `report-${reporterId}`,
        reporterId,
        targetKind: ReportTargetKind.POST,
        targetId,
        targetParentId: null,
        targetAuthorId: "user-1",
        reason: ReportReason.SPAM,
        details: null,
        contentSnapshot: "buy my coin",
        mediaKeys: [],
        status: "PENDING" as never,
        createdAt: new Date("2026-01-01T10:00:00Z"),
    });
}

describe("SendReportDigestUseCase", () => {
    let useCase: SendReportDigestUseCase;
    let reportRepository: Pick<
        IReportRepository,
        "findPending" | "countPending"
    >;
    let deliveryRepository: IReportDigestDeliveryRepository;
    let userRepository: Pick<IUserRepository, "findById">;
    let emailService: Pick<EmailPort, "sendReportDigest">;

    beforeEach(() => {
        reportRepository = {
            findPending: vi.fn().mockResolvedValue([openReport("r1")]),
            countPending: vi.fn().mockResolvedValue(1),
        };

        deliveryRepository = { claim: vi.fn().mockResolvedValue(true) };

        userRepository = {
            findById: vi.fn().mockResolvedValue(buildUser({ id: "user-1" })),
        };

        emailService = {
            sendReportDigest: vi.fn().mockResolvedValue(undefined),
        };

        useCase = new SendReportDigestUseCase(
            reportRepository as IReportRepository,
            deliveryRepository,
            userRepository as IUserRepository,
            emailService as EmailPort,
            CONFIG,
        );
    });

    it("should send the open queue and claim the day", async () => {
        const result = await useCase.execute(
            new Date("2026-03-02T06:30:00Z"),
        );

        expect(result).toEqual({
            sent: true,
            items: 1,
            pending: 1,
            alreadyClaimed: false,
        });

        // 06:30 UTC is 09:30 in Istanbul, so the claim is the 2nd.
        expect(deliveryRepository.claim).toHaveBeenCalledWith(
            new Date("2026-03-02T00:00:00.000Z"),
            1,
        );
        expect(emailService.sendReportDigest).toHaveBeenCalledTimes(1);
    });

    it("should measure the day in the configured timezone", async () => {
        // 22:30 UTC is already the next day in Istanbul.
        await useCase.execute(new Date("2026-03-02T22:30:00Z"));

        expect(deliveryRepository.claim).toHaveBeenCalledWith(
            new Date("2026-03-03T00:00:00.000Z"),
            1,
        );
    });

    it("should send nothing when the queue is empty", async () => {
        vi.mocked(reportRepository.findPending).mockResolvedValue([]);

        const result = await useCase.execute();

        expect(result.sent).toBe(false);
        expect(deliveryRepository.claim).not.toHaveBeenCalled();
        expect(emailService.sendReportDigest).not.toHaveBeenCalled();
    });

    it("should not send when another instance won the claim", async () => {
        vi.mocked(deliveryRepository.claim).mockResolvedValue(false);

        const result = await useCase.execute();

        expect(result).toEqual({
            sent: false,
            items: 0,
            pending: 1,
            alreadyClaimed: true,
        });
        expect(emailService.sendReportDigest).not.toHaveBeenCalled();
    });

    it("should claim only after the email is assembled", async () => {
        const order: string[] = [];

        vi.mocked(reportRepository.findPending).mockImplementation(async () => {
            order.push("read");
            return [openReport("r1")];
        });
        vi.mocked(deliveryRepository.claim).mockImplementation(async () => {
            order.push("claim");
            return true;
        });
        vi.mocked(emailService.sendReportDigest).mockImplementation(
            async () => {
                order.push("send");
            },
        );

        await useCase.execute();

        expect(order).toEqual(["read", "claim", "send"]);
    });

    it("should report the whole backlog beside a truncated email", async () => {
        vi.mocked(reportRepository.findPending).mockResolvedValue([
            openReport("r1", "post-1"),
            openReport("r2", "post-1"),
            openReport("r3", "post-2"),
        ]);
        vi.mocked(reportRepository.countPending).mockResolvedValue(120);

        const result = await useCase.execute();

        expect(result.items).toBe(2);
        expect(result.pending).toBe(120);

        const sent = vi.mocked(emailService.sendReportDigest).mock.calls[0]![0];

        expect(sent.totalPending).toBe(120);
        expect(sent.items[0]!.reporterCount).toBe(2);
    });

    it("should do nothing when disabled or unaddressed", async () => {
        for (const override of [{ enabled: false }, { alertEmail: "" }]) {
            const off = new SendReportDigestUseCase(
                reportRepository as IReportRepository,
                deliveryRepository,
                userRepository as IUserRepository,
                emailService as EmailPort,
                { ...CONFIG, ...override },
            );

            await expect(off.execute()).resolves.toEqual({
                sent: false,
                items: 0,
                pending: 0,
                alreadyClaimed: false,
            });
        }

        expect(reportRepository.findPending).not.toHaveBeenCalled();
    });

    it("should resolve each author once", async () => {
        vi.mocked(reportRepository.findPending).mockResolvedValue([
            openReport("r1", "post-1"),
            openReport("r2", "post-2"),
        ]);

        await useCase.execute();

        expect(userRepository.findById).toHaveBeenCalledTimes(1);
    });
});
