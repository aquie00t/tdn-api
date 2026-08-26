import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import type { UpdateAvatarUseCaseInput } from "./update-avatar-usecase.input";
import type { StoragePort } from "@core/ports/services/storage.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import { InvalidFileTypeError } from "@core/errors";
import { isDefaultMediaKey } from "@core/domain/constants/default-media.constants";

/**
 * Use case for updating a user's profile avatar.
 *
 * This use case handles uploading a new avatar image, updating the profile
 * with the new image URL, and cleaning up the old avatar if it exists.
 */
export class UpdateAvatarUseCase {
    /**
     * Creates a new instance of UpdateAvatarUseCase.
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
     * Executes the avatar update process.
     *
     * @param input - Input containing user ID, file data, MIME type, and original filename
     * @returns Promise<string> The uploaded file path/URL
     *
     * @throws InvalidFileTypeError - When the file type is not an image
     *
     * @remarks
     * This method validates the file type, uploads the new avatar image,
     * updates the profile with the new image URL, and attempts to delete
     * the old avatar image from storage. Deletion errors are logged but
     * don't prevent the operation from completing successfully.
     */
    async execute(input: UpdateAvatarUseCaseInput): Promise<string> {
        if (!input.mimeType.startsWith("image/")) {
            throw new InvalidFileTypeError(
                "Invalid file type. Only images are allowed.",
            );
        }
        const oldAvatarUrl = await this.profileRepository.findAvatarByUserId(
            input.userId,
        );

        const extension = input.originalFileName.split(".").pop() || "jpeg";
        const newFileName = `avatars/${input.userId}-${Date.now()}.${extension}`;

        const uploadedFilePath = await this.storageService.upload(
            newFileName,
            input.fileBuffer,
            input.mimeType,
        );

        await this.profileRepository.updateAvatar(
            input.userId,
            uploadedFilePath,
        );

        if (oldAvatarUrl && !isDefaultMediaKey(oldAvatarUrl)) {
            try {
                await this.storageService.delete(oldAvatarUrl);
            } catch (error) {
                this.logger?.error(
                    {
                        err: error,
                        userId: input.userId,
                        targetUrl: oldAvatarUrl,
                        op: "delete_old_avatar",
                    },
                    "failed to delete old avatar from storage",
                );
            }
        }

        return uploadedFilePath;
    }
}
