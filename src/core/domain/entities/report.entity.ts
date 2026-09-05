import { ReportStatus } from "@core/domain/enums";
import type { ReportReason, ReportTargetKind } from "@core/domain/enums";
import type { ReportProps } from "@core/domain/interfaces/report-props.interface";

/**
 * Rich domain model for one person's report of one piece of content.
 *
 * The entity carries a copy of what was reported rather than a pointer to it.
 * A report whose subject can delete it is not a moderation record, and the
 * quickest response available to a reported account is to remove the post - so
 * the author and the text are resolved when the report is filed and stored
 * alongside it.
 */
export class Report {
    private constructor(private readonly props: ReportProps) {}

    /**
     * Creates a report for content that has just been looked up.
     *
     * Always PENDING: the API never writes any other status. The remaining
     * three are moved by hand, the way a ban is applied.
     *
     * @param params - Who reported what, why, and what the content said
     * @returns A new Report instance
     */
    public static create(params: {
        reporterId: string;
        targetKind: ReportTargetKind;
        targetId: string;
        targetParentId?: string | null;
        targetAuthorId: string;
        reason: ReportReason;
        details?: string | null;
        contentSnapshot: string;
        mediaKeys?: string[];
    }): Report {
        return new Report({
            reporterId: params.reporterId,
            targetKind: params.targetKind,
            targetId: params.targetId,
            targetParentId: params.targetParentId ?? null,
            targetAuthorId: params.targetAuthorId,
            reason: params.reason,
            details: params.details ?? null,
            contentSnapshot: params.contentSnapshot,
            mediaKeys: params.mediaKeys ?? [],
            status: ReportStatus.PENDING,
            reviewedAt: null,
        });
    }

    /**
     * Rebuilds an entity from a persisted row.
     *
     * @param props - The stored shape
     * @returns The Report instance it describes
     */
    public static with(props: ReportProps): Report {
        return new Report(props);
    }

    get id(): string {
        return this.props.id!;
    }

    get reporterId(): string {
        return this.props.reporterId;
    }

    get targetKind(): ReportTargetKind {
        return this.props.targetKind;
    }

    get targetId(): string {
        return this.props.targetId;
    }

    get targetParentId(): string | null {
        return this.props.targetParentId ?? null;
    }

    get targetAuthorId(): string {
        return this.props.targetAuthorId;
    }

    get reason(): ReportReason {
        return this.props.reason;
    }

    get details(): string | null {
        return this.props.details ?? null;
    }

    get contentSnapshot(): string {
        return this.props.contentSnapshot;
    }

    get mediaKeys(): string[] {
        return this.props.mediaKeys;
    }

    get status(): ReportStatus {
        return this.props.status;
    }

    get reviewedAt(): Date | null {
        return this.props.reviewedAt ?? null;
    }

    get createdAt(): Date | undefined {
        return this.props.createdAt;
    }

    /**
     * Whether an operator has yet to deal with this report.
     *
     * @returns True while the report is still PENDING
     */
    public isOpen(): boolean {
        return this.props.status === ReportStatus.PENDING;
    }
}
