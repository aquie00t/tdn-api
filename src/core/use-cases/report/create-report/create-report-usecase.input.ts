import type { ReportReason, ReportTargetKind } from "@core/domain/enums";

/**
 * Input DTO for the CreateReportUseCase.
 */
export interface CreateReportUseCaseInput {
    /** The ID of the user filing the report. */
    currentUserId: string;

    /** Whether the reported content is a post or a comment. */
    targetKind: ReportTargetKind;

    /** The reported content's ID. */
    targetId: string;

    /** Why the reporter says it should not be there. */
    reason: ReportReason;

    /**
     * The reporter's own words. Optional, and length-capped by the HTTP
     * schema before it reaches here.
     */
    details?: string;
}
