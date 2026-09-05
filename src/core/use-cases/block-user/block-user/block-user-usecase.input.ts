/**
 * Input DTO for the BlockUserUseCase.
 */
export interface BlockUserUseCaseInput {
    /**
     * The ID of the user doing the blocking.
     */
    currentUserId: string;

    /**
     * The ID of the user being blocked. Must not equal currentUserId.
     */
    targetId: string;
}
