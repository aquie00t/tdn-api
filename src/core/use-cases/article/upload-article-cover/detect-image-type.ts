import { MediaKind } from "@core/domain/enums";
import { detectMediaType } from "@core/use-cases/shared/media/detect-media-type";

/**
 * A raster image format this API accepts for article covers.
 */
export interface DetectedImageType {
    /** File extension to use in the storage key */
    extension: "jpg" | "png" | "gif" | "webp" | "avif";

    /** MIME type derived from the bytes, not from the client */
    mimeType: string;
}

/**
 * Identifies an image by its magic bytes.
 *
 * A narrowing of {@link detectMediaType} rather than a second signature table:
 * an article cover is always a still, so a video that passes the shared check
 * must still be refused here. Keeping one table means a format is taught to
 * the platform once.
 *
 * @param buffer - The uploaded bytes
 * @returns The detected type, or null when the bytes are not a supported image
 */
export function detectImageType(buffer: Buffer): DetectedImageType | null {
    const detected = detectMediaType(buffer);

    if (!detected || detected.kind !== MediaKind.IMAGE) return null;

    return {
        extension: detected.extension as DetectedImageType["extension"],
        mimeType: detected.mimeType,
    };
}
