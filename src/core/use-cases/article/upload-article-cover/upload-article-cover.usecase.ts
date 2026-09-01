import { MediaChannel } from "@core/domain/enums";
import type { UploadModeratedMediaUseCase } from "@core/use-cases/media/upload-moderated-media";
import type { UploadArticleCoverUseCaseInput } from "./upload-article-cover-usecase.input";

/** Largest cover image accepted, in bytes. */
const MAX_COVER_BYTES = 5 * 1024 * 1024;

/**
 * Use case for uploading an article cover image.
 *
 * Returns a storage key rather than a URL. The article body accepts only that
 * key, validated against the uploader's own prefix, which is what keeps
 * arbitrary client-supplied URLs out of stored content.
 */
export class UploadArticleCoverUseCase {
    /**
     * Creates a new instance of UploadArticleCoverUseCase.
     *
     * @param uploadModeratedMediaUseCase - Shared upload path that validates,
     * moderates and records the file
     */
    constructor(
        private readonly uploadModeratedMediaUseCase: UploadModeratedMediaUseCase,
    ) {}

    /**
     * Executes the upload.
     *
     * A cover is always a still, so the shared path is told to refuse video:
     * the article read path has nowhere to put one, and a cover that cannot be
     * cleared inside the request would leave an article with a blank header
     * until a worker got to it.
     *
     * @param input - The uploader and the raw bytes
     * @returns The storage key of the stored image
     *
     * @throws PayloadTooLargeError - When the image exceeds the size limit
     * @throws InvalidMediaTypeError - When the bytes are not a supported format
     * @throws InvalidFileTypeError - When the bytes are a video
     * @throws MediaRejectedError - When moderation refuses the image
     */
    async execute(input: UploadArticleCoverUseCaseInput): Promise<string> {
        const result = await this.uploadModeratedMediaUseCase.execute({
            userId: input.userId,
            fileBuffer: input.fileBuffer,
            channel: MediaChannel.ARTICLE_COVER,
            keyPrefix: "articles/covers/" + input.userId,
            truncated: input.truncated,
            maxBytes: MAX_COVER_BYTES,
            allowVideo: false,
        });

        return result.storageKey;
    }
}
