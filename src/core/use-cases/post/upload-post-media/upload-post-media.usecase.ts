import { MediaChannel } from "@core/domain/enums";
import type { UploadModeratedMediaUseCase } from "@core/use-cases/media/upload-moderated-media";
import type { UploadPostMediaInput } from "./upload-post-media-usecase.input";

/** Largest post media file accepted, in bytes. */
const MAX_POST_MEDIA_BYTES = 5 * 1024 * 1024;

/**
 * Use case for uploading post media files.
 *
 * The endpoint is shared by posts and comments, and it is the only one that
 * accepts video, so it is also the only one that can hand back a file which is
 * stored but not yet cleared.
 */
export class UploadPostMediaUseCase {
    /**
     * Creates a new instance of UploadPostMediaUseCase.
     *
     * @param uploadModeratedMediaUseCase - Shared upload path that validates,
     * moderates and records the file
     */
    constructor(
        private readonly uploadModeratedMediaUseCase: UploadModeratedMediaUseCase,
    ) {}

    /**
     * Executes the media upload process.
     *
     * The client's MIME type and file name are ignored entirely: both are
     * attacker-controlled, and the shared upload path reads the format out of
     * the bytes instead.
     *
     * @param input - Input containing file data and user ID
     * @returns Promise<string> The storage key the file was stored under
     *
     * @throws InvalidMediaTypeError - When the bytes are not a supported format
     * @throws MediaRejectedError - When moderation refuses the file
     * @throws ModerationUnavailableError - When the provider could not be reached
     */
    async execute(input: UploadPostMediaInput): Promise<string> {
        const result = await this.uploadModeratedMediaUseCase.execute({
            userId: input.userId,
            fileBuffer: input.fileBuffer,
            channel: MediaChannel.POST_MEDIA,
            keyPrefix: "posts/" + input.userId,
            truncated: input.truncated,
            maxBytes: MAX_POST_MEDIA_BYTES,
            allowVideo: true,
        });

        return result.storageKey;
    }
}
