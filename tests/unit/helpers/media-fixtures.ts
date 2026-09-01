import { vi } from "vitest";
import { MediaModerationStatus } from "@core/domain/enums";
import type {
    MediaModerationPort,
    MediaModerationResult,
} from "@core/ports/services/media-moderation.port";

/**
 * Builds a buffer beginning with the given signature bytes.
 *
 * @param signature - The leading bytes
 * @param totalLength - How long the buffer should be
 * @returns A zero-padded buffer carrying the signature
 */
export function withSignature(signature: number[], totalLength = 32): Buffer {
    const buffer = Buffer.alloc(totalLength);
    for (let i = 0; i < signature.length; i++) buffer[i] = signature[i];
    return buffer;
}

/**
 * Writes an ASCII marker into a buffer at the given offset.
 *
 * @param buffer - The buffer to write into
 * @param offset - Where the marker starts
 * @param marker - The ASCII text
 * @returns The same buffer
 */
function withMarker(buffer: Buffer, offset: number, marker: string): Buffer {
    buffer.write(marker, offset, "latin1");
    return buffer;
}

export const JPEG = withSignature([0xff, 0xd8, 0xff]);
export const PNG = withSignature([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
export const GIF = withSignature([0x47, 0x49, 0x46, 0x38]);
export const SVG = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
);
export const HTML = Buffer.from("<!doctype html><script>alert(1)</script>");

/** WEBP needs "RIFF" at 0 and "WEBP" at 8. */
export function webp(): Buffer {
    return withMarker(withSignature([0x52, 0x49, 0x46, 0x46]), 8, "WEBP");
}

/** An ISO base media file: "ftyp" at 4, then the brand. */
export function isoMedia(brand: string): Buffer {
    return withMarker(withMarker(Buffer.alloc(32), 4, "ftyp"), 8, brand);
}

/** AVIF is a still in the MP4 container. */
export function avif(): Buffer {
    return isoMedia("avif");
}

export function mp4(): Buffer {
    return isoMedia("isom");
}

export function mov(): Buffer {
    return isoMedia("qt  ");
}

/** WEBM and MKV share the EBML header. */
export const WEBM = withSignature([0x1a, 0x45, 0xdf, 0xa3]);

/**
 * Builds a moderation port stub returning a fixed verdict.
 *
 * @param verdict - What both methods should answer
 * @returns A fake implementing the port
 */
export function fakeModeration(
    verdict: MediaModerationResult["verdict"] = MediaModerationStatus.APPROVED,
): MediaModerationPort {
    const result: MediaModerationResult = {
        verdict,
        categories: [],
        scores: {},
        provider: "fake",
    };

    return {
        moderateImage: vi.fn().mockResolvedValue(result),
        moderateVideo: vi.fn().mockResolvedValue(result),
    };
}
