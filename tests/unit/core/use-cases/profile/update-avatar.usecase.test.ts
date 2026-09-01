import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateAvatarUseCase } from "@core/use-cases/profile/update-avatar";
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
import { DEFAULT_AVATAR_KEY } from "@core/domain/constants/default-media.constants";

const NEW_KEY = "avatars/user-1/new.jpg";

describe("UpdateAvatarUseCase", () => {
    let useCase: UpdateAvatarUseCase;
    let profileRepository: Pick<
        IProfileRepository,
        "findAvatarByUserId" | "updateAvatar"
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
            findAvatarByUserId: vi.fn().mockResolvedValue(null),
            updateAvatar: vi.fn().mockResolvedValue(undefined),
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

        useCase = new UpdateAvatarUseCase(
            profileRepository as IProfileRepository,
            uploadModeratedMediaUseCase as UploadModeratedMediaUseCase,
            storageService as StoragePort,
            logger as LoggerPort,
        );
    });

    it("should upload through the avatar channel and refuse video", async () => {
        await useCase.execute(baseInput);

        expect(uploadModeratedMediaUseCase.execute).toHaveBeenCalledWith({
            userId: "user-1",
            fileBuffer: baseInput.fileBuffer,
            channel: MediaChannel.AVATAR,
            keyPrefix: "avatars/user-1",
            truncated: undefined,
            maxBytes: 5 * 1024 * 1024,
            allowVideo: false,
        });
    });

    it("should update the profile with the stored key and return it", async () => {
        const result = await useCase.execute(baseInput);

        expect(profileRepository.updateAvatar).toHaveBeenCalledWith(
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

        // An avatar travels into every feed and notification the user appears
        // in, so a refused one must leave the old one in place.
        expect(profileRepository.updateAvatar).not.toHaveBeenCalled();
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

        await expect(useCase.execute(baseInput)).resolves.toBe(NEW_KEY);
        expect(logger.error).toHaveBeenCalledOnce();
    });
});
