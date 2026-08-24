import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    UploadArticleCoverUseCase,
    detectImageType,
} from "@core/use-cases/article/upload-article-cover";
import type { CryptoPort } from "@core/ports/services/crypto.port";
import type { StoragePort } from "@core/ports/services/storage.port";
import { InvalidFileTypeError, PayloadTooLargeError } from "@core/errors";

const USER = "11111111-1111-4111-8111-111111111111";
const UUID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

/**
 * Builds a buffer beginning with the given signature bytes.
 */
function withSignature(signature: number[], totalLength = 32): Buffer {
    const buffer = Buffer.alloc(totalLength);
    for (let i = 0; i < signature.length; i++) buffer[i] = signature[i];
    return buffer;
}

const JPEG = withSignature([0xff, 0xd8, 0xff]);
const PNG = withSignature([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF = withSignature([0x47, 0x49, 0x46, 0x38]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const HTML = Buffer.from("<!doctype html><script>alert(1)</script>");

/**
 * WEBP needs "RIFF" at 0 and "WEBP" at 8.
 */
function webp(): Buffer {
    const buffer = withSignature([0x52, 0x49, 0x46, 0x46]);
    const marker = [0x57, 0x45, 0x42, 0x50];
    for (let i = 0; i < marker.length; i++) buffer[8 + i] = marker[i];
    return buffer;
}

/**
 * AVIF needs "ftypavif" starting at byte 4.
 */
function avif(): Buffer {
    const buffer = Buffer.alloc(32);
    const marker = [0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66];
    for (let i = 0; i < marker.length; i++) buffer[4 + i] = marker[i];
    return buffer;
}

describe("detectImageType()", () => {
    it("should recognise every accepted raster format", () => {
        expect(detectImageType(JPEG)).toEqual({
            extension: "jpg",
            mimeType: "image/jpeg",
        });
        expect(detectImageType(PNG)).toEqual({
            extension: "png",
            mimeType: "image/png",
        });
        expect(detectImageType(GIF)).toEqual({
            extension: "gif",
            mimeType: "image/gif",
        });
        expect(detectImageType(webp())).toEqual({
            extension: "webp",
            mimeType: "image/webp",
        });
        expect(detectImageType(avif())).toEqual({
            extension: "avif",
            mimeType: "image/avif",
        });
    });

    it("should reject SVG, which is a scriptable document rather than an image", () => {
        expect(detectImageType(SVG)).toBeNull();
    });

    it("should reject HTML", () => {
        expect(detectImageType(HTML)).toBeNull();
    });

    it("should reject an empty or truncated buffer", () => {
        expect(detectImageType(Buffer.alloc(0))).toBeNull();
        expect(detectImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
    });

    it("should not accept a RIFF container that is not WEBP", () => {
        const wav = withSignature([0x52, 0x49, 0x46, 0x46]);
        const marker = [0x57, 0x41, 0x56, 0x45];
        for (let i = 0; i < marker.length; i++) wav[8 + i] = marker[i];

        expect(detectImageType(wav)).toBeNull();
    });
});

describe("UploadArticleCoverUseCase", () => {
    let useCase: UploadArticleCoverUseCase;
    let storageService: Pick<StoragePort, "upload">;
    let cryptoService: Pick<CryptoPort, "generateUuid">;

    beforeEach(() => {
        storageService = {
            upload: vi
                .fn()
                .mockImplementation((key: string) => Promise.resolve(key)),
        };
        cryptoService = { generateUuid: vi.fn().mockReturnValue(UUID) };

        useCase = new UploadArticleCoverUseCase(
            storageService as StoragePort,
            cryptoService as CryptoPort,
        );
    });

    it("should store the image under the uploader's own prefix", async () => {
        const key = await useCase.execute({ userId: USER, fileBuffer: PNG });

        expect(key).toBe(`articles/covers/${USER}/${UUID}.png`);
    });

    it("should pass the sniffed mime type to storage, not a client-supplied one", async () => {
        await useCase.execute({ userId: USER, fileBuffer: JPEG });

        expect(storageService.upload).toHaveBeenCalledWith(
            `articles/covers/${USER}/${UUID}.jpg`,
            JPEG,
            "image/jpeg",
        );
    });

    it("should derive the extension from the bytes", async () => {
        const cases: Array<[Buffer, string]> = [
            [JPEG, "jpg"],
            [PNG, "png"],
            [GIF, "gif"],
            [webp(), "webp"],
            [avif(), "avif"],
        ];

        for (const [buffer, extension] of cases) {
            const key = await useCase.execute({
                userId: USER,
                fileBuffer: buffer,
            });
            expect(key.endsWith("." + extension)).toBe(true);
        }
    });

    it("should reject an SVG uploaded as if it were a PNG", async () => {
        await expect(
            useCase.execute({ userId: USER, fileBuffer: SVG }),
        ).rejects.toThrow(InvalidFileTypeError);

        expect(storageService.upload).not.toHaveBeenCalled();
    });

    it("should reject HTML", async () => {
        await expect(
            useCase.execute({ userId: USER, fileBuffer: HTML }),
        ).rejects.toThrow(InvalidFileTypeError);
    });

    it("should reject a buffer over the size limit", async () => {
        const tooBig = Buffer.alloc(5 * 1024 * 1024 + 1);
        tooBig[0] = 0xff;
        tooBig[1] = 0xd8;
        tooBig[2] = 0xff;

        await expect(
            useCase.execute({ userId: USER, fileBuffer: tooBig }),
        ).rejects.toThrow(PayloadTooLargeError);

        expect(storageService.upload).not.toHaveBeenCalled();
    });

    it("should reject a stream the transport truncated", async () => {
        await expect(
            useCase.execute({
                userId: USER,
                fileBuffer: PNG,
                truncated: true,
            }),
        ).rejects.toThrow(PayloadTooLargeError);
    });

    it("should produce a key that the article body validator accepts", async () => {
        const key = await useCase.execute({ userId: USER, fileBuffer: PNG });

        expect(key).toMatch(
            new RegExp(
                "^articles/covers/" +
                    USER +
                    "/[0-9a-f-]{36}[.](jpg|jpeg|png|webp|gif|avif)$",
            ),
        );
    });
});
