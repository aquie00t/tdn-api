import { CustomError } from "../common/custom.error";

/**
 * Error thrown when a conversation cannot be read by the requester.
 *
 * Covers both a conversation that does not exist and one that exists but
 * belongs to two other people. They share one error deliberately: a private
 * thread that answers "403, but it is there" would let anyone enumerate who
 * is talking to whom.
 *
 * @extends CustomError
 */
export class ConversationNotFoundError extends CustomError {
    /**
     * Creates a new ConversationNotFoundError instance.
     *
     * @param message - Optional custom error message
     */
    constructor(message = "Conversation not found.") {
        super(message, 404);
    }
}
