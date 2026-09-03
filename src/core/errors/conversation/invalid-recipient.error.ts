import { CustomError } from "../common/custom.error";

/**
 * Error thrown when a conversation cannot be opened with the given user.
 *
 * Covers writing to yourself, to an account that is being deleted, and to a
 * bot: none of the bot accounts that keep the feed populated can answer, so a
 * thread with one is a dead end the client should never be able to create.
 *
 * @extends CustomError
 */
export class InvalidRecipientError extends CustomError {
    /**
     * Creates a new InvalidRecipientError instance.
     *
     * @param message - Optional custom error message
     */
    constructor(message = "You cannot start a conversation with this user.") {
        super(message, 400);
    }
}
