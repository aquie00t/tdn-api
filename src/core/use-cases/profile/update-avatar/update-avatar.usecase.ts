import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import type { UpdateAvatarUseCaseInput } from "./update-avatar-usecase.input";
import type { StoragePort } from "@core/ports/services/storage.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import { MediaChannel } from "@core/domain/enums";
import type { UploadModeratedMediaUseCase } from "@core/use-cases/media/upload-moderated-media";
import { isDefaultMediaKey } from "@core/domain/constants/default-media.constants";

/** Largest avatar accepted, in bytes. */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

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
     * @param uploadModeratedMediaUseCase - Shared upload path that validates,
     * moderates and records the file
     * @param storageService - Service for file storage operations
     * @param logger - Service for logging operations
     */
    constructor(
        private readonly profileRepository: IProfileRepository,
        private readonly uploadModeratedMediaUseCase: UploadModeratedMediaUseCase,
        private readonly storageService: StoragePort,
        private readonly logger: LoggerPort,
    ) {}

    /**
     * Executes the avatar update process.
     *
     * @param input - Input containing user ID and file data
     * @returns Promise<string> The uploaded file path
     *
     * @throws InvalidMediaTypeError - When the bytes are not a supported format
     * @throws InvalidFileTypeError - When the bytes are a video
     * @throws MediaRejectedError - When moderation refuses the image
     *
     * @remarks
     * An avatar is the most public image a user has - it travels into every
     * feed, search result and notification they appear in - so it goes through
     * exactly the same moderation as post media rather than a lighter check.
     *
     * The old avatar is deleted only after the profile points at the new one.
     * Deletion errors are logged but don't prevent the operation from
     * completing successfully: the profile is already correct, and an orphaned
     * object costs storage rather than correctness.
     */
    async execute(input: UpdateAvatarUseCaseInput): Promise<string> {
        const oldAvatarUrl = await this.profileRepository.findAvatarByUserId(
            input.userId,
        );

        const { storageKey } = await this.uploadModeratedMediaUseCase.execute({
            userId: input.userId,
            fileBuffer: input.fileBuffer,
            channel: MediaChannel.AVATAR,
            keyPrefix: "avatars/" + input.userId,
            truncated: input.truncated,
            maxBytes: MAX_AVATAR_BYTES,
            allowVideo: false,
        });

        await this.profileRepository.updateAvatar(input.userId, storageKey);

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

        return storageKey;
    }
}
