import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import type { UpdateBannerUseCaseInput } from "./update-banner-usecase.input";
import { InvalidFileTypeError } from "@core/errors";
import type { StoragePort } from "@core/ports/services/storage.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import { isDefaultMediaKey } from "@core/domain/constants/default-media.constants";

/**
 * Use case for updating a user's profile banner.
 *
 * This use case handles uploading a new banner image, updating the profile
 * with the new image URL, and cleaning up the old banner if it exists.
 */
export class UpdateBannerUseCase {
    /**
     * Creates a new instance of UpdateBannerUseCase.
     *
     * @param profileRepository - Repository for managing profile data
     * @param storageService - Service for file storage operations
     * @param logger - Service for logging operations
     */
    constructor(
        private readonly profileRepository: IProfileRepository,
        private readonly storageService: StoragePort,
        private readonly logger: LoggerPort,
    ) {}

    /**
     * Executes the banner update process.
     *
     * @param input - Input containing user ID, file data, MIME type, and original filename
     * @returns Promise<string> The uploaded file path/URL
     *
     * @throws InvalidFileTypeError - When the file type is not an image
     *
     * @remarks
     * This method validates the file type, uploads the new banner image,
     * updates the profile with the new image URL, and attempts to delete
     * the old banner image from storage. Deletion errors are logged but
     * don't prevent the operation from completing successfully.
     */
    async execute(input: UpdateBannerUseCaseInput): Promise<string> {
        if (!input.mimeType.startsWith("image/")) {
            throw new InvalidFileTypeError(
                "Invalid file type. Only images are allowed.",
            );
        }

        const oldBannerUrl = await this.profileRepository.findBannerByUserId(
            input.userId,
        );

        const extension = input.originalFileName.split(".").pop() || "jpeg";
        const newFileName = `banners/${input.userId}-${Date.now()}.${extension}`;

        const uploadedFilePath = await this.storageService.upload(
            newFileName,
            input.fileBuffer,
            input.mimeType,
        );

        await this.profileRepository.updateBanner(
            input.userId,
            uploadedFilePath,
        );

        if (oldBannerUrl && !isDefaultMediaKey(oldBannerUrl)) {
            try {
                await this.storageService.delete(oldBannerUrl);
            } catch (error) {
                this.logger?.error(
                    {
                        err: error,
                        userId: input.userId,
                        targetUrl: oldBannerUrl,
                        op: "delete_old_banner",
                    },
                    "failed to delete old banner from storage",
                );
            }
        }

        return uploadedFilePath;
    }
}
