/**
 * Moderation lifecycle of a stored file.
 *
 * Mirrors the `MediaModerationStatus` enum in the Prisma schema exactly, so
 * domain values can be cast onto Prisma values without a translation layer.
 */
export enum MediaModerationStatus {
    /**
     * Uploaded but not yet judged. Only videos reach this state: an image is
     * scanned before it is written to storage, so it is never stored unjudged.
     */
    PENDING = "PENDING",

    /**
     * Claimed by a worker and currently being scanned. Exists purely so two
     * instances cannot pick up the same asset.
     */
    SCANNING = "SCANNING",

    /**
     * Clean. Served normally.
     */
    APPROVED = "APPROVED",

    /**
     * Borderline rather than forbidden. Served, but the content that carries it
     * is marked sensitive so the client can blur it behind a tap.
     */
    SENSITIVE = "SENSITIVE",

    /**
     * Forbidden. The object is deleted from storage and the read path never
     * returns its URL again.
     */
    REJECTED = "REJECTED",
}

/**
 * The three verdicts a moderation provider can return.
 *
 * A narrowed view of {@link MediaModerationStatus}: `PENDING` and `SCANNING`
 * describe where an asset sits in the pipeline, not what the provider said,
 * and a port implementation must never produce them.
 */
export type MediaModerationVerdict =
    | MediaModerationStatus.APPROVED
    | MediaModerationStatus.SENSITIVE
    | MediaModerationStatus.REJECTED;
