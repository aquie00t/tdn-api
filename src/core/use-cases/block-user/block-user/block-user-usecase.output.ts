/**
 * Output DTO for the BlockUserUseCase.
 */
export interface BlockUserUseCaseOutput {
    /**
     * Whether a block now stands. Always true on success - reported rather
     * than inferred so the client can render the button state from the
     * response instead of assuming it.
     */
    isBlocked: boolean;

    /**
     * Whether this call is what created the block, as opposed to finding one
     * already there. A repeated block is not an error.
     */
    created: boolean;
}
