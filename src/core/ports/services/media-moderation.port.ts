import type {
    MediaModerationCategory,
    MediaModerationVerdict,
} from "@core/domain/enums";

/**
 * What a moderation provider concluded about one file.
 */
export interface MediaModerationResult {
    /**
     * The verdict the rest of the system acts on.
     */
    verdict: MediaModerationVerdict;

    /**
     * Which categories triggered the verdict. Empty for a clean file.
     */
    categories: MediaModerationCategory[];

    /**
     * The provider's raw per-class scores, kept verbatim.
     *
     * Thresholds are a guess until they meet real traffic, and only the raw
     * numbers make it possible to retune them against what was actually
     * uploaded rather than against what we imagined would be.
     */
    scores: Record<string, number>;

    /**
     * Identifies which provider produced the verdict, so stored results stay
     * interpretable after a provider swap.
     */
    provider: string;
}

/**
 * Port interface for automated content moderation of uploaded media.
 *
 * Following Clean Architecture principles, this interface defines the contract
 * for moderation without exposing the provider behind it.
 */
export interface MediaModerationPort {
    /**
     * Scans a still image.
     *
     * Called inside the upload request, before a byte reaches storage, so that
     * forbidden content is never stored even briefly.
     *
     * @param buffer - The image bytes
     * @param mimeType - The MIME type detected from those bytes
     * @returns The provider's verdict
     */
    moderateImage(
        buffer: Buffer,
        mimeType: string,
    ): Promise<MediaModerationResult>;

    /**
     * Scans a video already in storage, by the URL the provider can fetch it
     * from.
     *
     * This blocks for as long as the provider needs to sample the video, which
     * is far too long for an HTTP request, so it is only ever called from the
     * background worker.
     *
     * @param publicUrl - Publicly reachable URL of the stored video
     * @returns The provider's verdict
     */
    moderateVideo(publicUrl: string): Promise<MediaModerationResult>;
}
