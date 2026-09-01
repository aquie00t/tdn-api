/**
 * Input interface for updating a user's profile banner.
 *
 * This interface defines the required parameters for uploading
 * and updating a user's profile banner image.
 */
export interface UpdateBannerUseCaseInput {
    /**
     * The unique identifier of the user whose banner is being updated.
     */
    userId: string;

    /**
     * The binary content of the image file to be uploaded as the new banner.
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
