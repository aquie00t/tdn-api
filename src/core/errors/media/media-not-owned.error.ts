import { CustomError } from "../common/custom.error";

/**
 * Error thrown when content references a media key its author cannot use.
 *
 * Covers all three ways a key can fail to belong to the request: no upload
 * ever produced it, someone else uploaded it, or moderation already rejected
 * it. They share one error deliberately - telling a caller which of the three
 * applies would let them probe for keys that exist.
 *
 * @extends CustomError
 */
export class MediaNotOwnedError extends CustomError {
    /**
     * Creates a new MediaNotOwnedError instance.
     *
     * @param message - Optional custom error message
     */
    constructor(
        message = "One or more media items are not available. Upload them again and retry.",
    ) {
        super(message, 400);
    }
}
