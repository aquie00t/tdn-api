import { CustomError } from "../common/custom.error";

/**
 * Error thrown when an action requires an article to be published.
 *
 * Commenting on a draft is the case this exists for: the draft is visible to
 * its author, so it is not a 404, but the action is not available yet.
 *
 * @extends CustomError
 */
export class ArticleNotPublishedError extends CustomError {
    /**
     * Creates a new ArticleNotPublishedError instance.
     *
     * @param message - Optional description of what was attempted
     */
    constructor(message = "This article has not been published yet.") {
        super(message, 409);
    }
}
