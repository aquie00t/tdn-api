/**
 * Output DTO for the UnblockUserUseCase.
 */
export interface UnblockUserUseCaseOutput {
    /**
     * Whether a block from this user still stands. Always false on success.
     *
     * Says nothing about the other direction: the target may have blocked back
     * independently, and that row is not this user's to lift.
     */
    isBlocked: boolean;

    /**
     * Whether this call is what removed the block, as opposed to finding none.
     */
    removed: boolean;
}
