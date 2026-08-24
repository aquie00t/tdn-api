import type { CommentTarget } from "@core/ports/repositories/comment.repository";

/**
 * Input for creating a comment on a post or an article.
 */
export interface CreateCommentUseCaseInput {
    /**
     * The textual content of the comment being created
     */
    content: string;

    /**
     * What the comment is attached to.
     *
     * A tagged target rather than a bare id, so a post id cannot be silently
     * accepted where an article id belongs.
     */
    target: CommentTarget;

    /**
     * The ID of the user who is creating the comment
     */
    authorId: string;

    /**
     * Optional ID of the parent comment, for a nested reply. The parent must
     * be attached to the same post or article.
     */
    parentId?: string;

    /**
     * Optional array of media URLs associated with the comment
     */
    mediaUrls?: string[];
}
