import { CustomError } from "../common/custom.error";

/**
 * Error thrown when a lifecycle transition is not legal for an article.
 *
 * Publishing an already published article or archiving one that was never
 * published are both requests the caller cannot satisfy by retrying, so they
 * are reported as a conflict rather than a bad request.
 *
 * @extends CustomError
 */
export class InvalidArticleStateError extends CustomError {
    /**
     * Creates a new InvalidArticleStateError instance.
     *
     * @param message - Description of the illegal transition
     */
    constructor(message: string) {
        super(message, 409);
    }
}
