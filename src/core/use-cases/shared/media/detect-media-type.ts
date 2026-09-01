import { MediaKind } from "@core/domain/enums";

/**
 * A file format this API accepts, as identified from its own bytes.
 */
export interface DetectedMediaType {
    /** Which pipeline the file goes down: images are scanned inline, videos are queued. */
    kind: MediaKind;

    /** File extension to use in the storage key */
    extension: string;

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
 * Reads a fixed-length ASCII run out of the buffer.
 *
 * @param buffer - The uploaded bytes
 * @param offset - Where the run starts
 * @param length - How many bytes to read
 * @returns The decoded string, or an empty string when the buffer is too short
 */
function ascii(buffer: Buffer, offset: number, length: number): string {
    if (buffer.length < offset + length) return "";

    return buffer.subarray(offset, offset + length).toString("latin1");
}

/** "ftyp" - the ISO base media file type box, at byte 4 of every MP4 family file. */
const FTYP = [0x66, 0x74, 0x79, 0x70];

/**
 * MP4-family brands accepted as video, mapped to what to call the result.
 *
 * An allow-list rather than "anything with an ftyp box": the same container
 * carries AVIF and HEIC images, and a few audio-only profiles, none of which
 * should be admitted by a rule about video.
 */
const VIDEO_BRANDS: Record<string, { extension: string; mimeType: string }> = {
    isom: { extension: "mp4", mimeType: "video/mp4" },
    iso2: { extension: "mp4", mimeType: "video/mp4" },
    iso4: { extension: "mp4", mimeType: "video/mp4" },
    iso5: { extension: "mp4", mimeType: "video/mp4" },
    iso6: { extension: "mp4", mimeType: "video/mp4" },
    mp41: { extension: "mp4", mimeType: "video/mp4" },
    mp42: { extension: "mp4", mimeType: "video/mp4" },
    avc1: { extension: "mp4", mimeType: "video/mp4" },
    mmp4: { extension: "mp4", mimeType: "video/mp4" },
    "M4V ": { extension: "m4v", mimeType: "video/x-m4v" },
    "qt  ": { extension: "mov", mimeType: "video/quicktime" },
    "3gp4": { extension: "3gp", mimeType: "video/3gpp" },
    "3gp5": { extension: "3gp", mimeType: "video/3gpp" },
    "3g2a": { extension: "3g2", mimeType: "video/3gpp2" },
};

/**
 * Identifies an image or video by its magic bytes.
 *
 * The client-supplied MIME type and file name are deliberately not consulted.
 * Both are attacker-controlled: a request can claim `image/png` while carrying
 * an SVG, and a name like `clip.png.html` reads as an image to a naive
 * extension check. Reading the bytes is the only statement about the file the
 * uploader cannot forge - and it is also what decides whether the file needs
 * an inline scan or a queued one, a decision no client should get to make.
 *
 * SVG has no signature to match and is therefore rejected for free, which is
 * the intended outcome: it is a scriptable document format rather than a
 * raster image, and serving one from the CDN would be a stored XSS.
 *
 * @param buffer - The uploaded bytes
 * @returns The detected type, or null when the bytes are not a supported file
 */
export function detectMediaType(buffer: Buffer): DetectedMediaType | null {
    // JPEG: FF D8 FF
    if (matches(buffer, 0, [0xff, 0xd8, 0xff])) {
        return {
            kind: MediaKind.IMAGE,
            extension: "jpg",
            mimeType: "image/jpeg",
        };
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (matches(buffer, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return {
            kind: MediaKind.IMAGE,
            extension: "png",
            mimeType: "image/png",
        };
    }

    // GIF: "GIF8"
    if (matches(buffer, 0, [0x47, 0x49, 0x46, 0x38])) {
        return {
            kind: MediaKind.IMAGE,
            extension: "gif",
            mimeType: "image/gif",
        };
    }

    // WEBP: "RIFF" then "WEBP" at byte 8
    if (
        matches(buffer, 0, [0x52, 0x49, 0x46, 0x46]) &&
        matches(buffer, 8, [0x57, 0x45, 0x42, 0x50])
    ) {
        return {
            kind: MediaKind.IMAGE,
            extension: "webp",
            mimeType: "image/webp",
        };
    }

    // The MP4 family. AVIF is checked first because it shares the container:
    // an "ftyp" box says nothing about whether the file is a still or a clip,
    // only the brand that follows does.
    if (matches(buffer, 4, FTYP)) {
        const brand = ascii(buffer, 8, 4);

        if (brand === "avif" || brand === "avis") {
            return {
                kind: MediaKind.IMAGE,
                extension: "avif",
                mimeType: "image/avif",
            };
        }

        const video = VIDEO_BRANDS[brand];

        if (video) {
            return { kind: MediaKind.VIDEO, ...video };
        }

        return null;
    }

    // WEBM / Matroska: the EBML header, 1A 45 DF A3. Both extensions share it,
    // and the platform serves either as WebM.
    if (matches(buffer, 0, [0x1a, 0x45, 0xdf, 0xa3])) {
        return {
            kind: MediaKind.VIDEO,
            extension: "webm",
            mimeType: "video/webm",
        };
    }

    return null;
}
