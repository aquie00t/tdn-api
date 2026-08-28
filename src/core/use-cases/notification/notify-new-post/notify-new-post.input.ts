import type { PostType } from "@core/domain/enums/post-type.enum";

/**
 * Input for the NotifyNewPostUseCase.
 */
export interface NotifyNewPostInput {
    /** The post that was just published. */
    postId: string;

    /** The account that published it, and the issuer of every notification. */
    authorId: string;

    /**
     * The type of the post. Only the bot-authored types notify followers;
     * anything else is ignored.
     */
    postType: PostType;
}
