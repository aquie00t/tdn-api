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
 * Compares a run of bytes against an expected signature.
 *
 * @param buffer - The uploaded bytes
 * @param offset - Where the signature should start
 * @param signature - The expected byte values
 * @returns True when every byte matches
 */
function matches(buffer: Buffer, offset: number, signature: number[]): boolean {
    if (buffer.length < offset + signature.length) return false;

    for (let i = 0; i < signature.length; i++) {
        if (buffer[offset + i] !== signature[i]) return false;
    }

    return true;
}

/**
 * Identifies an image by its magic bytes.
 *
 * The client-supplied MIME type and file name are deliberately not consulted.
 * Both are attacker-controlled: a request can claim `image/png` while carrying
 * an SVG, and a name like `cover.png.html` reads as an image to a naive
 * extension check. Reading the bytes is the only statement about the file the
 * uploader cannot forge.
 *
 * SVG has no signature to match and is therefore rejected for free, which is
 * the intended outcome: it is a scriptable document format rather than a
 * raster image, and serving one from the CDN would be a stored XSS.
 *
 * @param buffer - The uploaded bytes
 * @returns The detected type, or null when the bytes are not a supported image
 */
export function detectImageType(buffer: Buffer): DetectedImageType | null {
    // JPEG: FF D8 FF
    if (matches(buffer, 0, [0xff, 0xd8, 0xff])) {
        return { extension: "jpg", mimeType: "image/jpeg" };
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (matches(buffer, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return { extension: "png", mimeType: "image/png" };
    }

    // GIF: "GIF8"
    if (matches(buffer, 0, [0x47, 0x49, 0x46, 0x38])) {
        return { extension: "gif", mimeType: "image/gif" };
    }

    // WEBP: "RIFF" then "WEBP" at byte 8
    if (
        matches(buffer, 0, [0x52, 0x49, 0x46, 0x46]) &&
        matches(buffer, 8, [0x57, 0x45, 0x42, 0x50])
    ) {
        return { extension: "webp", mimeType: "image/webp" };
    }

    // AVIF: "ftypavif" at byte 4
    if (matches(buffer, 4, [0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66])) {
        return { extension: "avif", mimeType: "image/avif" };
    }

    return null;
}
