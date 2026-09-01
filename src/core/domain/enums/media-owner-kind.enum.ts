/**
 * Which kind of content an asset ended up on.
 *
 * Posts and comments share one upload endpoint, so {@link MediaChannel} cannot
 * tell them apart. This is set when the content that uses the asset is
 * created, and it is what lets the background worker write a video's verdict
 * back to the right table.
 *
 * Mirrors the `MediaOwnerKind` enum in the Prisma schema exactly.
 */
export enum MediaOwnerKind {
    POST = "POST",
    COMMENT = "COMMENT",
    ARTICLE = "ARTICLE",
}
