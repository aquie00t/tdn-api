/**
 * Input for the ListBlockedUseCase.
 */
export interface ListBlockedUseCaseInput {
    /**
     * The ID of the user whose own blocks are being listed. Always the caller:
     * one user's block list is not another's to read.
     */
    currentUserId: string;

    /**
     * The maximum number of rows to return.
     */
    limit: number;

    /**
     * The number of rows to skip before collecting the result set.
     */
    offset: number;
}
