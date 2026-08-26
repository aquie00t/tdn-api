import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateBannerUseCase } from "@core/use-cases/profile/update-banner";
import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import type { StoragePort } from "@core/ports/services/storage.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import { InvalidFileTypeError } from "@core/errors";
import { DEFAULT_BANNER_KEY } from "@core/domain/constants/default-media.constants";

describe("UpdateBannerUseCase", () => {
    let useCase: UpdateBannerUseCase;
    let profileRepository: Pick<
        IProfileRepository,
        "findBannerByUserId" | "updateBanner"
    >;
    let storageService: Pick<StoragePort, "upload" | "delete">;
    let logger: Pick<LoggerPort, "error">;

    const baseInput = {
        userId: "user-1",
        fileBuffer: Buffer.from("banner-data"),
        mimeType: "image/jpeg",
        originalFileName: "banner.jpg",
    };

    beforeEach(() => {
        profileRepository = {
            findBannerByUserId: vi.fn().mockResolvedValue(null),
            updateBanner: vi.fn().mockResolvedValue(undefined),
        };
        storageService = {
            upload: vi.fn().mockResolvedValue("banners/user-1-123.jpg"),
            delete: vi.fn().mockResolvedValue(undefined),
        };
        logger = {
            error: vi.fn(),
        };
        useCase = new UpdateBannerUseCase(
            profileRepository as IProfileRepository,
            storageService as StoragePort,
            logger as LoggerPort,
        );
    });

    it("should throw InvalidFileTypeError when mimeType does not start with 'image/'", async () => {
        await expect(
            useCase.execute({ ...baseInput, mimeType: "application/pdf" }),
        ).rejects.toThrow(InvalidFileTypeError);

        expect(storageService.upload).not.toHaveBeenCalled();
        expect(profileRepository.updateBanner).not.toHaveBeenCalled();
    });

    it("should upload the file and update the profile with the new URL", async () => {
        vi.mocked(storageService.upload).mockResolvedValue(
            "banners/user-1-new.jpg",
        );

        const result = await useCase.execute(baseInput);

        expect(storageService.upload).toHaveBeenCalledOnce();
        expect(profileRepository.updateBanner).toHaveBeenCalledWith(
            "user-1",
            "banners/user-1-new.jpg",
        );
        expect(result).toBe("banners/user-1-new.jpg");
    });

    it("should generate the filename with userId and extension from originalFileName", async () => {
        await useCase.execute(baseInput);

        const uploadCall = vi.mocked(storageService.upload).mock.calls[0];
        expect(uploadCall[0]).toMatch(/^banners\/user-1-\d+\.jpg$/);
        expect(uploadCall[1]).toBe(baseInput.fileBuffer);
        expect(uploadCall[2]).toBe("image/jpeg");
    });

    it("should not call storageService.delete when there is no old banner", async () => {
        vi.mocked(profileRepository.findBannerByUserId).mockResolvedValue(null);

        await useCase.execute(baseInput);

        expect(storageService.delete).not.toHaveBeenCalled();
    });

    it("should not call storageService.delete when old banner is the default", async () => {
        vi.mocked(profileRepository.findBannerByUserId).mockResolvedValue(
            `https://cdn.example.com/${DEFAULT_BANNER_KEY}`,
        );

        await useCase.execute(baseInput);

        expect(storageService.delete).not.toHaveBeenCalled();
    });

    it("should not call storageService.delete for the schema default banner key", async () => {
        vi.mocked(profileRepository.findBannerByUserId).mockResolvedValue(
            DEFAULT_BANNER_KEY,
        );

        await useCase.execute(baseInput);

        expect(storageService.delete).not.toHaveBeenCalled();
    });

    it("should not call storageService.delete when the default banner carries a cache-busting query", async () => {
        vi.mocked(profileRepository.findBannerByUserId).mockResolvedValue(
            `https://cdn.example.com/${DEFAULT_BANNER_KEY}?v=1`,
        );

        await useCase.execute(baseInput);

        expect(storageService.delete).not.toHaveBeenCalled();
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

        await expect(useCase.execute(baseInput)).resolves.toBeDefined();
        expect(logger.error).toHaveBeenCalledOnce();
    });

    it("should still return the uploaded path even when old banner deletion fails", async () => {
        vi.mocked(profileRepository.findBannerByUserId).mockResolvedValue(
            "banners/user-1-old.jpg",
        );
        vi.mocked(storageService.upload).mockResolvedValue(
            "banners/user-1-new.jpg",
        );
        vi.mocked(storageService.delete).mockRejectedValue(new Error("fail"));

        const result = await useCase.execute(baseInput);

        expect(result).toBe("banners/user-1-new.jpg");
    });
});
