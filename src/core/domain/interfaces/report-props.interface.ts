import type {
    ReportReason,
    ReportStatus,
    ReportTargetKind,
} from "@core/domain/enums";

/**
 * The persisted shape of a report.
 *
 * Two of these fields are copies rather than references, and that is the point
 * of the model: `targetAuthorId` and `contentSnapshot` are resolved when the
 * report is filed, so deleting the reported content cannot take the evidence
 * with it.
 */
export interface ReportProps {
    /** Set once persisted. */
    id?: string;

    reporterId: string;

    targetKind: ReportTargetKind;

    /** The post or comment id. Not a foreign key - see the entity. */
    targetId: string;

    /**
     * For a reported comment, the post it lives under. Null for a reported
     * post, and null for a comment on an article - an article is addressed by
     * slug, so a post id column cannot describe one.
     */
    targetParentId?: string | null;

    /** Who wrote the reported content, resolved at report time. */
    targetAuthorId: string;

    reason: ReportReason;

    /**
     * The reporter's own words. Optional, length-capped at the HTTP schema,
     * and escaped everywhere it is rendered - it is user input that reaches an
     * operator's inbox.
     */
    details?: string | null;

    /** The reported text as it stood when the report was filed. */
    contentSnapshot: string;

    /** Storage keys of whatever was attached, without any CDN prefix. */
    mediaKeys: string[];

    status: ReportStatus;

    /** When an operator last moved this out of PENDING. */
    reviewedAt?: Date | null;

    createdAt?: Date;
}
