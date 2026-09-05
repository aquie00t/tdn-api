/**
 * Input DTO for the UnblockUserUseCase.
 */
export interface UnblockUserUseCaseInput {
    /**
     * The ID of the user lifting the block.
     */
    currentUserId: string;

    /**
     * The ID of the user being unblocked.
     */
    targetId: string;
}
