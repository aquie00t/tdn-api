import { describe, expect, it } from "vitest";
import { MediaKind } from "@core/domain/enums";
import { detectMediaType } from "@core/use-cases/shared/media/detect-media-type";
import {
    GIF,
    HTML,
    JPEG,
    PNG,
    SVG,
    WEBM,
    avif,
    isoMedia,
    mov,
    mp4,
    webp,
    withSignature,
} from "../../../helpers/media-fixtures";

describe("detectMediaType()", () => {
    it("should recognise every accepted image format", () => {
        expect(detectMediaType(JPEG)).toEqual({
            kind: MediaKind.IMAGE,
            extension: "jpg",
            mimeType: "image/jpeg",
        });
        expect(detectMediaType(PNG)).toEqual({
            kind: MediaKind.IMAGE,
            extension: "png",
            mimeType: "image/png",
        });
        expect(detectMediaType(GIF)).toEqual({
            kind: MediaKind.IMAGE,
            extension: "gif",
            mimeType: "image/gif",
        });
        expect(detectMediaType(webp())).toEqual({
            kind: MediaKind.IMAGE,
            extension: "webp",
            mimeType: "image/webp",
        });
        expect(detectMediaType(avif())).toEqual({
            kind: MediaKind.IMAGE,
            extension: "avif",
            mimeType: "image/avif",
        });
    });

    it("should recognise the accepted video containers", () => {
        expect(detectMediaType(mp4())).toEqual({
            kind: MediaKind.VIDEO,
            extension: "mp4",
            mimeType: "video/mp4",
        });
        expect(detectMediaType(mov())).toEqual({
            kind: MediaKind.VIDEO,
            extension: "mov",
            mimeType: "video/quicktime",
        });
        expect(detectMediaType(WEBM)).toEqual({
            kind: MediaKind.VIDEO,
            extension: "webm",
            mimeType: "video/webm",
        });
    });

    it("should tell an AVIF still apart from a video in the same container", () => {
        // Both carry an ftyp box; only the brand separates them, which is why
        // the detector reads the brand rather than stopping at the box.
        expect(detectMediaType(avif())?.kind).toBe(MediaKind.IMAGE);
        expect(detectMediaType(mp4())?.kind).toBe(MediaKind.VIDEO);
    });

    it("should reject an MP4-family brand that is not on the allow list", () => {
        // HEIC lives in the same container. Admitting anything with an ftyp box
        // would let it, and the audio-only profiles, through as video.
        expect(detectMediaType(isoMedia("heic"))).toBeNull();
    });

    it("should reject scriptable and unknown formats", () => {
        expect(detectMediaType(SVG)).toBeNull();
        expect(detectMediaType(HTML)).toBeNull();
        expect(detectMediaType(Buffer.alloc(0))).toBeNull();
        expect(detectMediaType(Buffer.from([0xff, 0xd8]))).toBeNull();
    });

    it("should not mistake a RIFF container that is not WEBP for an image", () => {
        // "RIFF" alone is a WAV as readily as a WEBP.
        const wav = withSignature([0x52, 0x49, 0x46, 0x46]);
        wav.write("WAVE", 8, "latin1");

        expect(detectMediaType(wav)).toBeNull();
    });
});
