import type { CryptoPort } from "@core/ports/services/crypto.port";
import type { StoragePort } from "@core/ports/services/storage.port";
import { InvalidFileTypeError, PayloadTooLargeError } from "@core/errors";
import type { UploadArticleCoverUseCaseInput } from "./upload-article-cover-usecase.input";
import { detectImageType } from "./detect-image-type";

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
     * @param storageService - Object storage receiving the image
     * @param cryptoService - Source of the random file name
     */
    constructor(
        private readonly storageService: StoragePort,
        private readonly cryptoService: CryptoPort,
    ) {}

    /**
     * Executes the upload.
     *
     * The file name is generated, never derived from the upload: a client name
     * can carry a path traversal or a second extension, and neither can survive
     * a name the server invents.
     *
     * @param input - The uploader and the raw bytes
     * @returns The storage key of the stored image
     *
     * @throws PayloadTooLargeError - When the image exceeds the size limit
     * @throws InvalidFileTypeError - When the bytes are not a supported image
     */
    async execute(input: UploadArticleCoverUseCaseInput): Promise<string> {
        if (input.truncated || input.fileBuffer.byteLength > MAX_COVER_BYTES) {
            throw new PayloadTooLargeError(
                "Cover image must be 5 MB or smaller.",
            );
        }

        const detected = detectImageType(input.fileBuffer);

        if (!detected) {
            throw new InvalidFileTypeError(
                "Cover image must be a JPEG, PNG, GIF, WEBP or AVIF file.",
            );
        }

        const key =
            "articles/covers/" +
            input.userId +
            "/" +
            this.cryptoService.generateUuid() +
            "." +
            detected.extension;

        return await this.storageService.upload(
            key,
            input.fileBuffer,
            detected.mimeType,
        );
    }
}
