/**
 * The upload endpoint a file came through.
 *
 * Fixed at upload time, and it is what stops a key uploaded as an avatar from
 * later being attached to a post. It deliberately does not say what the file
 * ended up on: posts and comments share one upload endpoint, so at the moment
 * the bytes arrive there is nothing yet to say which of the two will claim
 * them.
 *
 * Mirrors the `MediaChannel` enum in the Prisma schema exactly.
 */
export enum MediaChannel {
    /**
     * The shared `POST /media` endpoint, which feeds both post and comment
     * media. Accepts images and video.
     */
    POST_MEDIA = "POST_MEDIA",

    /**
     * An article cover image.
     */
    ARTICLE_COVER = "ARTICLE_COVER",

    AVATAR = "AVATAR",

    BANNER = "BANNER",
}
