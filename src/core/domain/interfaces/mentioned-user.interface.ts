/**
 * A user named with an @handle inside a post, comment or article body.
 *
 * Only the identity is carried: the id is what the relation stores, and the
 * username is read back from the user row, so a rename is reflected everywhere
 * the mention is rendered without rewriting any content.
 */
export interface MentionedUser {
    /** Unique identifier of the mentioned user */
    id: string;

    /** Current handle of the mentioned user, without the leading "@" */
    username: string;
}
