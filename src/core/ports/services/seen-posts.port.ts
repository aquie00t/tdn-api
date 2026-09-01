/**
 * Port interface for remembering which posts a reader has already been shown.
 *
 * Following Clean Architecture principles, this interface defines the contract
 * without saying where the record lives or how long it survives. It is
 * deliberately a separate port rather than more methods on `CachePort`: this
 * is not a cache of something expensive to recompute, it is a record of what
 * happened, and losing it changes what a reader sees rather than only how fast
 * they see it.
 */
export interface SeenPostsPort {
    /**
     * Records that these posts were served to this reader.
     *
     * Must not fail the caller. A feed page that was already assembled is
     * worth serving even when the record of it cannot be written - the cost is
     * that the reader may see a post twice, which is a far better outcome than
     * an error.
     *
     * @param userId - The reader the posts were served to.
     * @param postIds - The posts on the page.
     */
    markSeen(userId: string, postIds: string[]): Promise<void>;

    /**
     * Narrows a list of posts to the ones this reader has not been shown.
     *
     * Order is preserved, so a caller can hand in a ranked list and get a
     * ranked list back.
     *
     * @param userId - The reader to check against.
     * @param postIds - The candidate posts.
     * @returns The subset the reader has not seen, in the order given.
     */
    filterUnseen(userId: string, postIds: string[]): Promise<string[]>;
}
