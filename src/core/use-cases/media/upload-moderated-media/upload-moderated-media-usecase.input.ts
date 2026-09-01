import type { MediaChannel } from "@core/domain/enums";

/**
 * Input for a moderated upload.
 */
export interface UploadModeratedMediaInput {
    /**
     * The unique identifier of the user uploading the file.
     */
    userId: string;

    /**
     * The binary content of the file.
     */
    fileBuffer: Buffer;

    /**
     * Which upload endpoint the file arrived through. Stored on the asset and
     * checked again when content tries to attach it.
     */
    channel: MediaChannel;

    /**
     * Storage key prefix, without a trailing slash. The file name itself is
     * always generated.
     */
    keyPrefix: string;

    /**
     * Whether the multipart layer cut the file short at its size limit.
     */
    truncated?: boolean;

    /**
     * Largest accepted size in bytes.
     */
    maxBytes: number;

    /**
     * Whether this endpoint accepts video. Only post media does.
     */
    allowVideo: boolean;
}
