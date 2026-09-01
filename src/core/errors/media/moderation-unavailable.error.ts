import { CustomError } from "../common/custom.error";

/**
 * Error thrown when the moderation provider could not be reached.
 *
 * The upload fails closed. Letting an unscanned file through whenever the
 * provider is down would turn every outage into an open door, and an outage is
 * exactly when someone testing the limits would try again.
 *
 * @extends CustomError
 */
export class ModerationUnavailableError extends CustomError {
    /**
     * Creates a new ModerationUnavailableError instance.
     *
     * @param message - Optional custom error message
     */
    constructor(
        message = "Media could not be checked right now. Please try again in a moment.",
    ) {
        super(message, 503);
    }
}
