import { MediaAsset } from "@core/domain/entities/media-asset.entity";
import {
    MediaKind,
    MediaModerationStatus,
    type MediaModerationCategory,
    type MediaModerationVerdict,
} from "@core/domain/enums";
import {
    InvalidFileTypeError,
    InvalidMediaTypeError,
    MediaRejectedError,
    ModerationUnavailableError,
    PayloadTooLargeError,
} from "@core/errors";
import type { IMediaAssetRepository } from "@core/ports/repositories/media-asset.repository";
import type { CryptoPort } from "@core/ports/services/crypto.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type {
    MediaModerationPort,
    MediaModerationResult,
} from "@core/ports/services/media-moderation.port";
import type { StoragePort } from "@core/ports/services/storage.port";
import { detectMediaType } from "@core/use-cases/shared/media/detect-media-type";
import type { UploadModeratedMediaInput } from "./upload-moderated-media-usecase.input";
import type { UploadModeratedMediaOutput } from "./upload-moderated-media-usecase.output";

/**
 * The verdict and its supporting detail, once an image has been cleared.
 */
interface ImageModerationVerdict {
    verdict: MediaModerationVerdict;
    categories: MediaModerationCategory[];
    scores: Record<string, number>;
    provider: string;
}

/**
 * Use case for storing an uploaded file that has been checked for forbidden
 * content.
 *
 * Every upload endpoint on the platform goes through here, so the rules about
 * what may be stored live in one place rather than being restated - and
 * eventually diverging - at four call sites.
 */
export class UploadModeratedMediaUseCase {
    /**
     * Creates a new instance of UploadModeratedMediaUseCase.
     *
     * @param storageService - Object storage receiving the file
     * @param mediaModerationService - Automated content moderation
     * @param mediaAssetRepository - Repository recording what was stored
     * @param cryptoService - Source of the generated file name
     * @param logger - Service for logging operations
     */
    constructor(
        private readonly storageService: StoragePort,
        private readonly mediaModerationService: MediaModerationPort,
        private readonly mediaAssetRepository: IMediaAssetRepository,
        private readonly cryptoService: CryptoPort,
        private readonly logger: LoggerPort,
    ) {}

    /**
     * Executes the upload.
     *
     * The order of the steps is the whole design. An image is scanned before a
     * byte reaches storage, so forbidden content is never held even briefly and
     * never gets a URL, not even an unlisted one. A video cannot be treated
     * that way - the provider has to fetch and sample it, which takes far
     * longer than a request may be held open - so it is stored first and
     * scanned by the background worker, and the read path withholds it until a
     * verdict exists.
     *
     * The file name is generated rather than derived from the upload: a client
     * name can carry a path traversal or a second extension, and neither can
     * survive a name the server invents.
     *
     * @param input - The uploader, the raw bytes, and where they belong
     * @returns The stored key and the state it was stored in
     *
     * @throws PayloadTooLargeError - When the file exceeds the size limit
     * @throws InvalidMediaTypeError - When the bytes are not a supported format
     * @throws InvalidFileTypeError - When a video reaches an image-only endpoint
     * @throws MediaRejectedError - When moderation refuses the file
     * @throws ModerationUnavailableError - When the provider could not be reached
     */
    async execute(
        input: UploadModeratedMediaInput,
    ): Promise<UploadModeratedMediaOutput> {
        if (input.truncated || input.fileBuffer.byteLength > input.maxBytes) {
            const megabytes = Math.floor(input.maxBytes / (1024 * 1024));

            throw new PayloadTooLargeError(
                "File must be " + megabytes + " MB or smaller.",
            );
        }

        const detected = detectMediaType(input.fileBuffer);

        // The message follows the endpoint rather than the failure: telling
        // someone uploading an article cover that videos are allowed would be
        // a lie, and they would go and try one.
        if (
            !detected ||
            (detected.kind === MediaKind.VIDEO && !input.allowVideo)
        ) {
            throw input.allowVideo
                ? new InvalidMediaTypeError()
                : new InvalidFileTypeError(
                      "Invalid file type. Only images are allowed.",
                  );
        }

        const storageKey =
            input.keyPrefix +
            "/" +
            this.cryptoService.generateUuid() +
            "." +
            detected.extension;

        const moderation =
            detected.kind === MediaKind.IMAGE
                ? await this.moderateImage(input, detected.mimeType, storageKey)
                : null;

        await this.storageService.upload(
            storageKey,
            input.fileBuffer,
            detected.mimeType,
        );

        const asset = await this.mediaAssetRepository.create(
            MediaAsset.create({
                storageKey,
                kind: detected.kind,
                mimeType: detected.mimeType,
                byteSize: input.fileBuffer.byteLength,
                uploaderId: input.userId,
                channel: input.channel,
                verdict: moderation?.verdict,
                categories: moderation?.categories,
                scores: moderation?.scores,
                provider: moderation?.provider,
            }),
        );

        return {
            storageKey: asset.storageKey,
            kind: detected.kind,
            status: asset.status,
        };
    }

    /**
     * Scans an image and turns a rejection into an error.
     *
     * A provider that cannot be reached fails the upload rather than waving the
     * file through. Letting unscanned files past during an outage would turn
     * every outage into an open door, and an outage is exactly when someone
     * testing the limits would try again.
     *
     * @param input - The upload being checked
     * @param mimeType - The type detected from the bytes
     * @param storageKey - The key the file would be stored under, for the log
     * @returns The provider's result when the file may be stored
     *
     * @throws MediaRejectedError - When the file is refused
     * @throws ModerationUnavailableError - When the provider could not be reached
     */
    private async moderateImage(
        input: UploadModeratedMediaInput,
        mimeType: string,
        storageKey: string,
    ): Promise<ImageModerationVerdict> {
        let result: MediaModerationResult;

        try {
            result = await this.mediaModerationService.moderateImage(
                input.fileBuffer,
                mimeType,
            );
        } catch (error) {
            this.logger.error(
                {
                    context: "MediaModeration",
                    userId: input.userId,
                    channel: input.channel,
                    error: error instanceof Error ? error.message : error,
                },
                "Moderation provider unreachable; refusing the upload.",
            );

            throw new ModerationUnavailableError();
        }

        if (result.verdict === MediaModerationStatus.REJECTED) {
            this.logger.warn(
                {
                    context: "MediaModeration",
                    userId: input.userId,
                    channel: input.channel,
                    storageKey,
                    categories: result.categories,
                },
                "Rejected an uploaded image.",
            );

            throw new MediaRejectedError();
        }

        return {
            verdict: result.verdict,
            categories: result.categories,
            scores: result.scores,
            provider: result.provider,
        };
    }
}
