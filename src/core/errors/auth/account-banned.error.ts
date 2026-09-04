import { CustomError } from "../common/custom.error";

/**
 * Error thrown when a suspended account tries to use the API.
 *
 * 403 rather than 401 on purpose. A 401 tells the client its session is stale,
 * so it refreshes, fails, and drops the user at the login screen with no idea
 * why. A 403 carrying this title lets the client say what actually happened.
 *
 * @extends CustomError
 */
export class AccountBannedError extends CustomError {
    /**
     * Creates a new AccountBannedError instance.
     *
     * @param message - Optional custom error message (defaults to "This account has been suspended.")
     */
    constructor(message = "This account has been suspended.") {
        super(message, 403);
    }
}
