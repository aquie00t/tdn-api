import type { CommentTarget } from "@core/ports/repositories/comment.repository";

/**
 * Input for listing the top-level comments of a post or an article.
 */
export interface GetPostCommentsUseCaseInput {
    /** What the comments are attached to */
    target: CommentTarget;

    /** 1-based page number */
    page?: number;

    /** Page size */
    limit?: number;

    /** The viewer, used for like and bookmark flags */
    currentUserId?: string;
}
