import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateBannerUseCase } from "@core/use-cases/profile/update-banner";
import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import type { StoragePort } from "@core/ports/services/storage.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { UploadModeratedMediaUseCase } from "@core/use-cases/media/upload-moderated-media";
import {
    MediaChannel,
    MediaKind,
    MediaModerationStatus,
} from "@core/domain/enums";
import { MediaRejectedError } from "@core/errors";
import { DEFAULT_BANNER_KEY } from "@core/domain/constants/default-media.constants";

const NEW_KEY = "banners/user-1/new.jpg";

describe("UpdateBannerUseCase", () => {
    let useCase: UpdateBannerUseCase;
    let profileRepository: Pick<
        IProfileRepository,
        "findBannerByUserId" | "updateBanner"
    >;
    let storageService: Pick<StoragePort, "delete">;
    let logger: Pick<LoggerPort, "error">;
    let uploadModeratedMediaUseCase: Pick<
        UploadModeratedMediaUseCase,
        "execute"
    >;

    const baseInput = {
        userId: "user-1",
        fileBuffer: Buffer.from("image-data"),
    };

    beforeEach(() => {
        profileRepository = {
            findBannerByUserId: vi.fn().mockResolvedValue(null),
            updateBanner: vi.fn().mockResolvedValue(undefined),
        };
        storageService = {
            delete: vi.fn().mockResolvedValue(undefined),
        };
        logger = { error: vi.fn() };
        uploadModeratedMediaUseCase = {
            execute: vi.fn().mockResolvedValue({
                storageKey: NEW_KEY,
                kind: MediaKind.IMAGE,
                status: MediaModerationStatus.APPROVED,
            }),
        };

        useCase = new UpdateBannerUseCase(
            profileRepository as IProfileRepository,
            uploadModeratedMediaUseCase as UploadModeratedMediaUseCase,
            storageService as StoragePort,
            logger as LoggerPort,
        );
    });

    it("should upload through the banner channel and refuse video", async () => {
        await useCase.execute(baseInput);

        expect(uploadModeratedMediaUseCase.execute).toHaveBeenCalledWith({
            userId: "user-1",
            fileBuffer: baseInput.fileBuffer,
            channel: MediaChannel.BANNER,
            keyPrefix: "banners/user-1",
            truncated: undefined,
            maxBytes: 5 * 1024 * 1024,
            allowVideo: false,
        });
    });

    it("should update the profile with the stored key and return it", async () => {
        const result = await useCase.execute(baseInput);

        expect(profileRepository.updateBanner).toHaveBeenCalledWith(
            "user-1",
            NEW_KEY,
        );
        expect(result).toBe(NEW_KEY);
    });

    it("should not touch the profile when moderation refuses the image", async () => {
        vi.mocked(uploadModeratedMediaUseCase.execute).mockRejectedValue(
            new MediaRejectedError(),
        );

        await expect(useCase.execute(baseInput)).rejects.toThrow(
            MediaRejectedError,
        );

        expect(profileRepository.updateBanner).not.toHaveBeenCalled();
    });

    it("should not call storageService.delete when there is no old banner", async () => {
        vi.mocked(profileRepository.findBannerByUserId).mockResolvedValue(null);

        await useCase.execute(baseInput);

        expect(storageService.delete).not.toHaveBeenCalled();
    });

    it("should not call storageService.delete for the default banner, however it is stored", async () => {
        // The default has been written as a bare key, as a CDN URL, and with a
        // cache-busting query. None of the three may be deleted.
        for (const stored of [
            DEFAULT_BANNER_KEY,
            `https://cdn.example.com/${DEFAULT_BANNER_KEY}`,
            `https://cdn.example.com/${DEFAULT_BANNER_KEY}?v=1`,
        ]) {
            vi.mocked(profileRepository.findBannerByUserId).mockResolvedValue(
                stored,
            );

            await useCase.execute(baseInput);

            expect(storageService.delete).not.toHaveBeenCalled();
        }
    });

    it("should delete the old banner when it exists and is not the default", async () => {
        const oldUrl = "banners/user-1-old.jpg";
        vi.mocked(profileRepository.findBannerByUserId).mockResolvedValue(
            oldUrl,
        );

        await useCase.execute(baseInput);

        expect(storageService.delete).toHaveBeenCalledOnce();
        expect(storageService.delete).toHaveBeenCalledWith(oldUrl);
    });

    it("should log the error and not throw when deleting old banner fails", async () => {
        vi.mocked(profileRepository.findBannerByUserId).mockResolvedValue(
            "banners/user-1-old.jpg",
        );
        vi.mocked(storageService.delete).mockRejectedValue(
            new Error("Storage unavailable"),
        );

        await expect(useCase.execute(baseInput)).resolves.toBe(NEW_KEY);
        expect(logger.error).toHaveBeenCalledOnce();
    });
});
