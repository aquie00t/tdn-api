import { describe, expect, it } from "vitest";
import { Report } from "@core/domain/entities/report.entity";
import { ReportReason, ReportTargetKind } from "@core/domain/enums";
import { ReportPrismaMapper } from "@infrastructure/persistence/mappers/report-prisma.mapper";
import type { Report as PrismaReport } from "@generated/prisma/client";

const ROW = {
    id: "report-1",
    reporterId: "reporter-1",
    targetKind: "COMMENT",
    targetId: "comment-1",
    targetParentId: "post-1",
    targetAuthorId: "author-1",
    reason: "HARASSMENT",
    details: "they keep replying to me",
    contentSnapshot: "go away",
    mediaKeys: ["a.jpg"],
    status: "PENDING",
    reviewedAt: null,
    createdAt: new Date("2026-01-01T10:00:00Z"),
} as unknown as PrismaReport;

describe("ReportPrismaMapper", () => {
    it("should map a row onto the entity", () => {
        const report = ReportPrismaMapper.toDomain(ROW);

        expect(report.id).toBe("report-1");
        expect(report.targetKind).toBe(ReportTargetKind.COMMENT);
        expect(report.targetParentId).toBe("post-1");
        expect(report.reason).toBe(ReportReason.HARASSMENT);
        expect(report.contentSnapshot).toBe("go away");
        expect(report.mediaKeys).toEqual(["a.jpg"]);
        expect(report.isOpen()).toBe(true);
    });

    it("should connect both users on create and leave the status to the column default", () => {
        const input = ReportPrismaMapper.toPrismaCreate(
            Report.create({
                reporterId: "reporter-1",
                targetKind: ReportTargetKind.POST,
                targetId: "post-1",
                targetAuthorId: "author-1",
                reason: ReportReason.SPAM,
                contentSnapshot: "buy my coin",
            }),
        );

        expect(input.reporter).toEqual({ connect: { id: "reporter-1" } });
        expect(input.targetAuthor).toEqual({ connect: { id: "author-1" } });
        expect(input.targetParentId).toBeNull();
        expect(input.mediaKeys).toEqual([]);
        expect(input).not.toHaveProperty("status");
    });
});
