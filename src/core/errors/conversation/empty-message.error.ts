import { CustomError } from "../common/custom.error";

/**
 * Error thrown when a message carries neither text nor media.
 *
 * @extends CustomError
 */
export class EmptyMessageError extends CustomError {
    /**
     * Creates a new EmptyMessageError instance.
     *
     * @param message - Optional custom error message
     */
    constructor(message = "A message must contain text or media.") {
        super(message, 400);
    }
}
