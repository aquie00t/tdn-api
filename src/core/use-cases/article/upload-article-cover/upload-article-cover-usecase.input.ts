/**
 * Input for uploading an article cover image.
 *
 * There is no mimeType or file name field on purpose: both are supplied by the
 * client and neither is trusted. The type is read from the bytes.
 */
export interface UploadArticleCoverUseCaseInput {
    /** The authenticated uploader; the key is scoped to them */
    userId: string;

    /** The uploaded bytes */
    fileBuffer: Buffer;

    /** Whether the transport truncated the stream at its size limit */
    truncated?: boolean;
}
