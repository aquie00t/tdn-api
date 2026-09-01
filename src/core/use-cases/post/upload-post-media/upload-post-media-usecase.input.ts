/**
 * Input interface for uploading post media files.
 *
 * This interface defines the required parameters for uploading media files
 * (images or videos) associated with posts and comments.
 */
export interface UploadPostMediaInput {
    /**
     * The unique identifier of the user uploading the media.
     */
    userId: string;

    /**
     * The binary content of the file to be uploaded.
     */
    fileBuffer: Buffer;

    /**
     * Whether the multipart layer cut the file short at its size limit.
     *
     * A truncated file is refused rather than stored: the bytes that were cut
     * off are exactly the ones moderation never got to look at.
     */
    truncated?: boolean;
}
