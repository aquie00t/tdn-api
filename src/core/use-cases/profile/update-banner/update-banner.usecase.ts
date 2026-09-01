import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import type { UpdateBannerUseCaseInput } from "./update-banner-usecase.input";
import type { StoragePort } from "@core/ports/services/storage.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import { MediaChannel } from "@core/domain/enums";
import type { UploadModeratedMediaUseCase } from "@core/use-cases/media/upload-moderated-media";
import { isDefaultMediaKey } from "@core/domain/constants/default-media.constants";

/** Largest banner accepted, in bytes. */
const MAX_BANNER_BYTES = 5 * 1024 * 1024;

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
     * Executes the banner update process.
     *
     * @param input - Input containing user ID and file data
     * @returns Promise<string> The uploaded file path
     *
     * @throws InvalidMediaTypeError - When the bytes are not a supported format
     * @throws InvalidFileTypeError - When the bytes are a video
     * @throws MediaRejectedError - When moderation refuses the image
     *
     * @remarks
     * A banner is shown to every visitor of the profile, so it is moderated on
     * the same terms as post media.
     *
     * The old banner is deleted only after the profile points at the new one.
     * Deletion errors are logged but don't prevent the operation from
     * completing successfully.
     */
    async execute(input: UpdateBannerUseCaseInput): Promise<string> {
        const oldBannerUrl = await this.profileRepository.findBannerByUserId(
            input.userId,
        );

        const { storageKey } = await this.uploadModeratedMediaUseCase.execute({
            userId: input.userId,
            fileBuffer: input.fileBuffer,
            channel: MediaChannel.BANNER,
            keyPrefix: "banners/" + input.userId,
            truncated: input.truncated,
            maxBytes: MAX_BANNER_BYTES,
            allowVideo: false,
        });

        await this.profileRepository.updateBanner(input.userId, storageKey);

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

        return storageKey;
    }
}
