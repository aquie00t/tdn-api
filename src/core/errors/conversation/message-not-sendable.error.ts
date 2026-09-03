import { CustomError } from "../common/custom.error";

/**
 * Error thrown when a participant may not write to a conversation.
 *
 * Raised for a declined conversation, and for the recipient of a pending
 * request who tries to reply without accepting it first.
 *
 * @extends CustomError
 */
export class MessageNotSendableError extends CustomError {
    /**
     * Creates a new MessageNotSendableError instance.
     *
     * @param message - Optional custom error message
     */
    constructor(message = "You cannot send messages in this conversation.") {
        super(message, 403);
    }
}
