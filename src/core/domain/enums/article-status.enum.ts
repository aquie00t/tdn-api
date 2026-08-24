/**
 * Lifecycle states of an article.
 *
 * Mirrors the `ArticleStatus` enum in the Prisma schema exactly, so domain
 * values can be cast onto Prisma values without a translation layer.
 */
export enum ArticleStatus {
    /**
     * Visible only to its author. Never returned by any public read path.
     */
    DRAFT = "DRAFT",

    /**
     * Publicly readable. The only state included in list queries and caches.
     */
    PUBLISHED = "PUBLISHED",

    /**
     * Retired by the author. Keeps its slug but is hidden from everyone
     * except the author, so previously shared links stop resolving.
     */
    ARCHIVED = "ARCHIVED",
}
