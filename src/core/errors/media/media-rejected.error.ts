import { CustomError } from "../common/custom.error";

/**
 * Error thrown when moderation refuses an uploaded file.
 *
 * The upload is abandoned rather than stored and hidden: content this error
 * covers - explicit sexual imagery, gore, depicted violence - has no state in
 * which the platform wants to be holding it.
 *
 * @extends CustomError
 */
export class MediaRejectedError extends CustomError {
    /**
     * Creates a new MediaRejectedError instance.
     *
     * @param message - Optional custom error message
     */
    constructor(
        message = "This file was rejected because it appears to contain explicit or violent content.",
    ) {
        super(message, 422);
    }
}
