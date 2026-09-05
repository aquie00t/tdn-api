import { CustomError } from "../common/custom.error";

/**
 * Error thrown when a block stands between the caller and the account they are
 * acting on.
 *
 * 403 rather than 404, for the reason {@link AccountBannedError} is a 403: the
 * client has a screen for this, and it can only reach it if the response says
 * what happened. Blocking is disclosed on purpose here - a follow that fails
 * silently reads as a bug, and leaves the blocked user retrying.
 *
 * Direct messaging deliberately does *not* use this error. Those endpoints
 * already fold every rejection into one shape so they cannot be used to probe
 * the user table, and a block that announced itself there would undo that.
 *
 * @extends CustomError
 */
export class UserBlockedError extends CustomError {
    /**
     * Creates a new UserBlockedError instance.
     *
     * @param message - Optional custom error message
     */
    constructor(message = "You cannot interact with this user.") {
        super(message, 403);
    }
}
