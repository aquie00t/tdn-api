import type { MediaKind, MediaModerationStatus } from "@core/domain/enums";

/**
 * The result of a moderated upload.
 */
export interface UploadModeratedMediaOutput {
    /**
     * The key the file was stored under.
     */
    storageKey: string;

    /**
     * Whether the file went down the image path or the video path.
     */
    kind: MediaKind;

    /**
     * The asset's moderation state. PENDING only ever for a video.
     */
    status: MediaModerationStatus;
}
