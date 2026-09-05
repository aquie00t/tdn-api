import { describe, expect, it } from "vitest";
import { Report } from "@core/domain/entities/report.entity";
import { ReportReason, ReportTargetKind } from "@core/domain/enums";
import { groupReports } from "@core/use-cases/shared/reports/group-reports";

const FRONTEND = "https://tdn.example/";

const CONTEXT = {
    usernames: new Map([["author-1", "ada"]]),
    frontendUrl: FRONTEND,
    excerptLength: 40,
    maxDetails: 2,
};

/**
 * Builds a persisted report, since grouping reads `createdAt`.
 */
function buildReport(overrides: {
    reporterId: string;
    createdAt: Date;
    targetKind?: ReportTargetKind;
    targetId?: string;
    targetParentId?: string | null;
    reason?: ReportReason;
    details?: string | null;
    contentSnapshot?: string;
    mediaKeys?: string[];
}): Report {
    const created = Report.create({
        reporterId: overrides.reporterId,
        targetKind: overrides.targetKind ?? ReportTargetKind.POST,
        targetId: overrides.targetId ?? "post-1",
        targetParentId: overrides.targetParentId ?? null,
        targetAuthorId: "author-1",
        reason: overrides.reason ?? ReportReason.SPAM,
        details: overrides.details ?? null,
        contentSnapshot: overrides.contentSnapshot ?? "buy my coin",
        mediaKeys: overrides.mediaKeys ?? [],
    });

    return Report.with({
        id: `report-${overrides.reporterId}`,
        reporterId: created.reporterId,
        targetKind: created.targetKind,
        targetId: created.targetId,
        targetParentId: created.targetParentId,
        targetAuthorId: created.targetAuthorId,
        reason: created.reason,
        details: created.details,
        contentSnapshot: created.contentSnapshot,
        mediaKeys: created.mediaKeys,
        status: created.status,
        createdAt: overrides.createdAt,
    });
}

describe("groupReports", () => {
    it("should collect reports of the same target into one entry", () => {
        const items = groupReports(
            [
                buildReport({
                    reporterId: "r1",
                    createdAt: new Date("2026-01-01T10:00:00Z"),
                }),
                buildReport({
                    reporterId: "r2",
                    createdAt: new Date("2026-01-01T11:00:00Z"),
                    reason: ReportReason.HARASSMENT,
                }),
            ],
            CONTEXT,
        );

        expect(items).toHaveLength(1);
        expect(items[0]!.reporterCount).toBe(2);
        expect(items[0]!.authorUsername).toBe("ada");
        expect(items[0]!.firstReportedAt).toEqual(
            new Date("2026-01-01T10:00:00Z"),
        );
        expect(items[0]!.lastReportedAt).toEqual(
            new Date("2026-01-01T11:00:00Z"),
        );
    });

    it("should keep a post and a comment sharing an id apart", () => {
        const items = groupReports(
            [
                buildReport({
                    reporterId: "r1",
                    createdAt: new Date("2026-01-01T10:00:00Z"),
                    targetId: "same-id",
                }),
                buildReport({
                    reporterId: "r2",
                    createdAt: new Date("2026-01-01T10:00:00Z"),
                    targetKind: ReportTargetKind.COMMENT,
                    targetId: "same-id",
                }),
            ],
            CONTEXT,
        );

        expect(items).toHaveLength(2);
    });

    it("should order the most reported content first", () => {
        const items = groupReports(
            [
                buildReport({
                    reporterId: "r1",
                    createdAt: new Date("2026-01-01T10:00:00Z"),
                    targetId: "quiet",
                }),
                buildReport({
                    reporterId: "r2",
                    createdAt: new Date("2026-01-01T10:00:00Z"),
                    targetId: "loud",
                }),
                buildReport({
                    reporterId: "r3",
                    createdAt: new Date("2026-01-01T10:05:00Z"),
                    targetId: "loud",
                }),
            ],
            CONTEXT,
        );

        expect(items.map((item) => item.targetId)).toEqual(["loud", "quiet"]);
    });

    it("should tally reasons with the most cited first", () => {
        const items = groupReports(
            [
                buildReport({
                    reporterId: "r1",
                    createdAt: new Date("2026-01-01T10:00:00Z"),
                    reason: ReportReason.HATE,
                }),
                buildReport({
                    reporterId: "r2",
                    createdAt: new Date("2026-01-01T10:01:00Z"),
                    reason: ReportReason.SPAM,
                }),
                buildReport({
                    reporterId: "r3",
                    createdAt: new Date("2026-01-01T10:02:00Z"),
                    reason: ReportReason.SPAM,
                }),
            ],
            CONTEXT,
        );

        expect(items[0]!.reasons).toEqual([
            { reason: ReportReason.SPAM, count: 2 },
            { reason: ReportReason.HATE, count: 1 },
        ]);
    });

    it("should take the excerpt and media count from the earliest report", () => {
        const items = groupReports(
            [
                buildReport({
                    reporterId: "late",
                    createdAt: new Date("2026-01-01T12:00:00Z"),
                    contentSnapshot: "edited afterwards",
                    mediaKeys: [],
                }),
                buildReport({
                    reporterId: "early",
                    createdAt: new Date("2026-01-01T09:00:00Z"),
                    contentSnapshot: "as it was written",
                    mediaKeys: ["a.jpg", "b.jpg"],
                }),
            ],
            CONTEXT,
        );

        expect(items[0]!.excerpt).toBe("as it was written");
        expect(items[0]!.mediaCount).toBe(2);
    });

    it("should trim a long excerpt on a word boundary", () => {
        const items = groupReports(
            [
                buildReport({
                    reporterId: "r1",
                    createdAt: new Date("2026-01-01T10:00:00Z"),
                    contentSnapshot:
                        "the quick brown fox jumps over the lazy dog and keeps going",
                }),
            ],
            CONTEXT,
        );

        expect(items[0]!.excerpt.length).toBeLessThanOrEqual(41);
        expect(items[0]!.excerpt.endsWith("…")).toBe(true);
        expect(items[0]!.excerpt).not.toContain("  ");
    });

    it("should cap the reporter notes and drop empty ones", () => {
        const items = groupReports(
            [
                buildReport({
                    reporterId: "r1",
                    createdAt: new Date("2026-01-01T10:00:00Z"),
                    details: "first",
                }),
                buildReport({
                    reporterId: "r2",
                    createdAt: new Date("2026-01-01T10:01:00Z"),
                    details: null,
                }),
                buildReport({
                    reporterId: "r3",
                    createdAt: new Date("2026-01-01T10:02:00Z"),
                    details: "second",
                }),
                buildReport({
                    reporterId: "r4",
                    createdAt: new Date("2026-01-01T10:03:00Z"),
                    details: "third",
                }),
            ],
            CONTEXT,
        );

        expect(items[0]!.details).toEqual(["first", "second"]);
    });

    it("should link a post directly and a comment through its post", () => {
        const [post] = groupReports(
            [
                buildReport({
                    reporterId: "r1",
                    createdAt: new Date("2026-01-01T10:00:00Z"),
                    targetId: "post-9",
                }),
            ],
            CONTEXT,
        );

        const [comment] = groupReports(
            [
                buildReport({
                    reporterId: "r1",
                    createdAt: new Date("2026-01-01T10:00:00Z"),
                    targetKind: ReportTargetKind.COMMENT,
                    targetId: "comment-9",
                    targetParentId: "post-9",
                }),
            ],
            CONTEXT,
        );

        expect(post!.url).toBe("https://tdn.example/posts/post-9");
        expect(comment!.url).toBe(
            "https://tdn.example/posts/post-9#comment-comment-9",
        );
    });

    it("should fall back to the origin for a comment with no post", () => {
        const [item] = groupReports(
            [
                buildReport({
                    reporterId: "r1",
                    createdAt: new Date("2026-01-01T10:00:00Z"),
                    targetKind: ReportTargetKind.COMMENT,
                    targetId: "comment-9",
                    targetParentId: null,
                }),
            ],
            CONTEXT,
        );

        expect(item!.url).toBe("https://tdn.example");
    });

    it("should name an author it cannot resolve", () => {
        const [item] = groupReports(
            [
                buildReport({
                    reporterId: "r1",
                    createdAt: new Date("2026-01-01T10:00:00Z"),
                }),
            ],
            { ...CONTEXT, usernames: new Map() },
        );

        expect(item!.authorUsername).toBe("unknown");
    });
});
