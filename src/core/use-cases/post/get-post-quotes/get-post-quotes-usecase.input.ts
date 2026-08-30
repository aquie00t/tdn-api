/**
 * Input for the GetPostQuotesUseCase.
 *
 * Describes one page of the posts quoting a given post.
 */
export interface GetPostQuotesInput {
    /** The post whose quotes are being listed. */
    postId: string;

    /** The page number to retrieve. */
    page: number;

    /** How many quotes to return per page. */
    limit: number;

    /**
     * Optional id of the caller, used to fill in whether they have liked or
     * bookmarked each quote in the page.
     */
    currentUserId?: string;
}
