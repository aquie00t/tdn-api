import { MediaChannel } from "@core/domain/enums";
import type { UploadModeratedMediaUseCase } from "@core/use-cases/media/upload-moderated-media";
import type { UploadMessageMediaInput } from "./upload-message-media-usecase.input";

/** Largest message media file accepted, in bytes. */
const MAX_MESSAGE_MEDIA_BYTES = 5 * 1024 * 1024;

/**
 * Use case for uploading a file to attach to a direct message.
 *
 * A separate endpoint from post media rather than a shared one, because the
 * channel is fixed at upload time: that is what stops a file uploaded for a
 * private conversation from being attached to a public post, and a post's
 * media from being replayed into somebody's inbox.
 */
export class UploadMessageMediaUseCase {
    /**
     * Creates a new instance of UploadMessageMediaUseCase.
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
    async execute(input: UploadMessageMediaInput): Promise<string> {
        const result = await this.uploadModeratedMediaUseCase.execute({
            userId: input.userId,
            fileBuffer: input.fileBuffer,
            channel: MediaChannel.MESSAGE_MEDIA,
            keyPrefix: "messages/" + input.userId,
            truncated: input.truncated,
            maxBytes: MAX_MESSAGE_MEDIA_BYTES,
            allowVideo: true,
        });

        return result.storageKey;
    }
}
