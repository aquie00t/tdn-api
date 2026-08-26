import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateAvatarUseCase } from "@core/use-cases/profile/update-avatar";
import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import type { StoragePort } from "@core/ports/services/storage.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import { InvalidFileTypeError } from "@core/errors";
import { DEFAULT_AVATAR_KEY } from "@core/domain/constants/default-media.constants";

describe("UpdateAvatarUseCase", () => {
    let useCase: UpdateAvatarUseCase;
    let profileRepository: Pick<
        IProfileRepository,
        "findAvatarByUserId" | "updateAvatar"
    >;
    let storageService: Pick<StoragePort, "upload" | "delete">;
    let logger: Pick<LoggerPort, "error">;

    const baseInput = {
        userId: "user-1",
        fileBuffer: Buffer.from("image-data"),
        mimeType: "image/jpeg",
        originalFileName: "photo.jpg",
    };

    beforeEach(() => {
        profileRepository = {
            findAvatarByUserId: vi.fn().mockResolvedValue(null),
            updateAvatar: vi.fn().mockResolvedValue(undefined),
        };
        storageService = {
            upload: vi.fn().mockResolvedValue("avatars/user-1-123.jpg"),
            delete: vi.fn().mockResolvedValue(undefined),
        };
        logger = {
            error: vi.fn(),
        };
        useCase = new UpdateAvatarUseCase(
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
        expect(profileRepository.updateAvatar).not.toHaveBeenCalled();
    });

    it("should upload the file and update the profile with the new URL", async () => {
        vi.mocked(storageService.upload).mockResolvedValue(
            "avatars/user-1-new.jpg",
        );

        const result = await useCase.execute(baseInput);

        expect(storageService.upload).toHaveBeenCalledOnce();
        expect(profileRepository.updateAvatar).toHaveBeenCalledWith(
            "user-1",
            "avatars/user-1-new.jpg",
        );
        expect(result).toBe("avatars/user-1-new.jpg");
    });

    it("should generate the filename with userId and extension from originalFileName", async () => {
        await useCase.execute(baseInput);

        const uploadCall = vi.mocked(storageService.upload).mock.calls[0];
        expect(uploadCall[0]).toMatch(/^avatars\/user-1-\d+\.jpg$/);
        expect(uploadCall[1]).toBe(baseInput.fileBuffer);
        expect(uploadCall[2]).toBe("image/jpeg");
    });

    it("should not call storageService.delete when there is no old avatar", async () => {
        vi.mocked(profileRepository.findAvatarByUserId).mockResolvedValue(null);

        await useCase.execute(baseInput);

        expect(storageService.delete).not.toHaveBeenCalled();
    });

    it("should not call storageService.delete when old avatar is the default", async () => {
        vi.mocked(profileRepository.findAvatarByUserId).mockResolvedValue(
            `https://cdn.example.com/${DEFAULT_AVATAR_KEY}`,
        );

        await useCase.execute(baseInput);

        expect(storageService.delete).not.toHaveBeenCalled();
    });

    it("should delete the old avatar when it exists and is not the default", async () => {
        const oldUrl = "avatars/user-1-old.jpg";
        vi.mocked(profileRepository.findAvatarByUserId).mockResolvedValue(
            oldUrl,
        );

        await useCase.execute(baseInput);

        expect(storageService.delete).toHaveBeenCalledOnce();
        expect(storageService.delete).toHaveBeenCalledWith(oldUrl);
    });

    it("should log the error and not throw when deleting old avatar fails", async () => {
        vi.mocked(profileRepository.findAvatarByUserId).mockResolvedValue(
            "avatars/user-1-old.jpg",
        );
        vi.mocked(storageService.delete).mockRejectedValue(
            new Error("Storage unavailable"),
        );

        await expect(useCase.execute(baseInput)).resolves.toBeDefined();
        expect(logger.error).toHaveBeenCalledOnce();
    });

    it("should still return the uploaded path even when old avatar deletion fails", async () => {
        vi.mocked(profileRepository.findAvatarByUserId).mockResolvedValue(
            "avatars/user-1-old.jpg",
        );
        vi.mocked(storageService.upload).mockResolvedValue(
            "avatars/user-1-new.jpg",
        );
        vi.mocked(storageService.delete).mockRejectedValue(new Error("fail"));

        const result = await useCase.execute(baseInput);

        expect(result).toBe("avatars/user-1-new.jpg");
    });
});
