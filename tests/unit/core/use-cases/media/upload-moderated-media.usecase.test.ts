import { beforeEach, describe, expect, it, vi } from "vitest";
import { UploadModeratedMediaUseCase } from "@core/use-cases/media/upload-moderated-media";
import {
    MediaChannel,
    MediaKind,
    MediaModerationCategory,
    MediaModerationStatus,
} from "@core/domain/enums";
import { MediaAsset } from "@core/domain/entities/media-asset.entity";
import type { IMediaAssetRepository } from "@core/ports/repositories/media-asset.repository";
import type { CryptoPort } from "@core/ports/services/crypto.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { MediaModerationPort } from "@core/ports/services/media-moderation.port";
import type { StoragePort } from "@core/ports/services/storage.port";
import {
    InvalidFileTypeError,
    InvalidMediaTypeError,
    MediaRejectedError,
    ModerationUnavailableError,
    PayloadTooLargeError,
} from "@core/errors";
import { JPEG, PNG, SVG, mp4 } from "../../../helpers/media-fixtures";

const USER = "11111111-1111-4111-8111-111111111111";
const UUID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("UploadModeratedMediaUseCase", () => {
    let useCase: UploadModeratedMediaUseCase;
    let storageService: Pick<StoragePort, "upload">;
    let moderation: MediaModerationPort;
    let mediaAssetRepository: Pick<IMediaAssetRepository, "create">;
    let cryptoService: Pick<CryptoPort, "generateUuid">;
    let logger: Pick<LoggerPort, "error" | "warn">;

    const postMedia = {
        userId: USER,
        channel: MediaChannel.POST_MEDIA,
        keyPrefix: "posts/" + USER,
        maxBytes: 5 * 1024 * 1024,
        allowVideo: true,
    };

    beforeEach(() => {
        storageService = {
            upload: vi
                .fn()
                .mockImplementation((key: string) => Promise.resolve(key)),
        };
        moderation = {
            moderateImage: vi.fn().mockResolvedValue({
                verdict: MediaModerationStatus.APPROVED,
                categories: [],
                scores: {},
                provider: "fake",
            }),
            moderateVideo: vi.fn(),
        };
        mediaAssetRepository = {
            // Echoes the entity back the way a create does, id aside.
            create: vi.fn().mockImplementation((asset: MediaAsset) => {
                return Promise.resolve(asset);
            }),
        };
        cryptoService = { generateUuid: vi.fn().mockReturnValue(UUID) };
        logger = { error: vi.fn(), warn: vi.fn() };

        useCase = new UploadModeratedMediaUseCase(
            storageService as StoragePort,
            moderation,
            mediaAssetRepository as IMediaAssetRepository,
            cryptoService as CryptoPort,
            logger as LoggerPort,
        );
    });

    describe("image path", () => {
        it("should scan the image before anything is written to storage", async () => {
            vi.mocked(moderation.moderateImage).mockResolvedValue({
                verdict: MediaModerationStatus.REJECTED,
                categories: [MediaModerationCategory.SEXUAL_ACTIVITY],
                scores: { "nudity.sexual_activity": 0.98 },
                provider: "fake",
            });

            await expect(
                useCase.execute({ ...postMedia, fileBuffer: JPEG }),
            ).rejects.toThrow(MediaRejectedError);

            // The whole point of scanning first: a refused file never gets a
            // URL, not even an unlisted one.
            expect(storageService.upload).not.toHaveBeenCalled();
            expect(mediaAssetRepository.create).not.toHaveBeenCalled();
        });

        it("should store a borderline image and record it as sensitive", async () => {
            vi.mocked(moderation.moderateImage).mockResolvedValue({
                verdict: MediaModerationStatus.SENSITIVE,
                categories: [MediaModerationCategory.SUGGESTIVE],
                scores: { "nudity.suggestive": 0.6 },
                provider: "fake",
            });

            const result = await useCase.execute({
                ...postMedia,
                fileBuffer: PNG,
            });

            expect(storageService.upload).toHaveBeenCalledOnce();
            expect(result.status).toBe(MediaModerationStatus.SENSITIVE);
        });

        it("should store a clean image as approved", async () => {
            const result = await useCase.execute({
                ...postMedia,
                fileBuffer: PNG,
            });

            expect(result).toEqual({
                storageKey: `posts/${USER}/${UUID}.png`,
                kind: MediaKind.IMAGE,
                status: MediaModerationStatus.APPROVED,
            });
        });

        it("should pass the sniffed mime type on, not a client-supplied one", async () => {
            await useCase.execute({ ...postMedia, fileBuffer: JPEG });

            expect(moderation.moderateImage).toHaveBeenCalledWith(
                JPEG,
                "image/jpeg",
            );
            expect(storageService.upload).toHaveBeenCalledWith(
                `posts/${USER}/${UUID}.jpg`,
                JPEG,
                "image/jpeg",
            );
        });

        it("should fail closed when the provider cannot be reached", async () => {
            vi.mocked(moderation.moderateImage).mockRejectedValue(
                new Error("ETIMEDOUT"),
            );

            await expect(
                useCase.execute({ ...postMedia, fileBuffer: PNG }),
            ).rejects.toThrow(ModerationUnavailableError);

            // Waving files through during an outage would make the outage the
            // way past the filter.
            expect(storageService.upload).not.toHaveBeenCalled();
        });
    });

    describe("video path", () => {
        it("should store a video as pending without calling the provider", async () => {
            const result = await useCase.execute({
                ...postMedia,
                fileBuffer: mp4(),
            });

            expect(result).toEqual({
                storageKey: `posts/${USER}/${UUID}.mp4`,
                kind: MediaKind.VIDEO,
                status: MediaModerationStatus.PENDING,
            });
            // The worker owns video: sampling one takes far longer than a
            // request may be held open.
            expect(moderation.moderateImage).not.toHaveBeenCalled();
        });

        it("should refuse a video on an image-only endpoint", async () => {
            await expect(
                useCase.execute({
                    ...postMedia,
                    fileBuffer: mp4(),
                    allowVideo: false,
                }),
            ).rejects.toThrow(InvalidFileTypeError);

            expect(storageService.upload).not.toHaveBeenCalled();
        });
    });

    describe("input validation", () => {
        it("should reject bytes that are not a supported format", async () => {
            await expect(
                useCase.execute({ ...postMedia, fileBuffer: SVG }),
            ).rejects.toThrow(InvalidMediaTypeError);
        });

        it("should reject a stream the transport truncated", async () => {
            // The bytes that were cut off are exactly the ones moderation
            // never got to look at.
            await expect(
                useCase.execute({
                    ...postMedia,
                    fileBuffer: PNG,
                    truncated: true,
                }),
            ).rejects.toThrow(PayloadTooLargeError);
        });

        it("should reject a buffer over the size limit", async () => {
            const tooBig = Buffer.alloc(5 * 1024 * 1024 + 1);
            tooBig[0] = 0xff;
            tooBig[1] = 0xd8;
            tooBig[2] = 0xff;

            await expect(
                useCase.execute({ ...postMedia, fileBuffer: tooBig }),
            ).rejects.toThrow(PayloadTooLargeError);
        });

        it("should never derive the file name from the upload", async () => {
            const key = (
                await useCase.execute({ ...postMedia, fileBuffer: PNG })
            ).storageKey;

            expect(key).toBe(`posts/${USER}/${UUID}.png`);
            expect(cryptoService.generateUuid).toHaveBeenCalled();
        });
    });
});
