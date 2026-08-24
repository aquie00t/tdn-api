import { CustomError } from "./custom.error";

/**
 * Error thrown when an upload exceeds the size the endpoint accepts.
 *
 * @extends CustomError
 */
export class PayloadTooLargeError extends CustomError {
    /**
     * Creates a new PayloadTooLargeError instance.
     *
     * @param message - Description of the limit that was exceeded
     */
    constructor(message: string) {
        super(message, 413);
    }
}
