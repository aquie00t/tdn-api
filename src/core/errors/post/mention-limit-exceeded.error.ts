import { CustomError } from "../common/custom.error";

/**
 * Error thrown when a body names more distinct users than are allowed.
 *
 * The limit is applied to the handles written in the content, before any of
 * them is looked up, so the answer does not depend on how many of them happen
 * to be real accounts. Rejecting rather than truncating keeps the stored
 * mentions an honest record of what the author wrote.
 *
 * @extends CustomError
 */
export class MentionLimitExceededError extends CustomError {
    /**
     * Creates a new MentionLimitExceededError instance.
     *
     * @param message - Optional custom error message (defaults to "At most 10 mentions are allowed per post.")
     */
    constructor(message = "At most 10 mentions are allowed per post.") {
        super(message, 400);
    }
}
