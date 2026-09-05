import { BadRequestError } from "@core/errors";
import type { IBlockRepository } from "@core/ports/repositories/block.repository";
import type { UnblockUserUseCaseInput } from "./unblock-user-usecase.input";
import type { UnblockUserUseCaseOutput } from "./unblock-user-usecase.output";

/**
 * Use case for lifting a block.
 *
 * Restores visibility and nothing else. The follows the block tore down do not
 * come back, and a conversation that was hidden reappears exactly as it was -
 * with its status, its unread counters and its whole history, because none of
 * those were touched on the way in.
 */
export class UnblockUserUseCase {
    /**
     * Creates a new instance of UnblockUserUseCase.
     *
     * @param blockRepository - Repository for managing blocks
     */
    constructor(private readonly blockRepository: IBlockRepository) {}

    /**
     * Lifts this user's block on another.
     *
     * Idempotent: unblocking somebody who is not blocked succeeds quietly.
     * There is no target lookup either - a block can outlive the account it
     * names, and refusing to clear one because the user is gone would leave a
     * row nobody can remove.
     *
     * @param input - Who is unblocking whom
     * @returns The resulting state, and whether this call changed anything
     *
     * @throws BadRequestError - When a user targets themselves
     */
    async execute(
        input: UnblockUserUseCaseInput,
    ): Promise<UnblockUserUseCaseOutput> {
        const { currentUserId, targetId } = input;

        if (currentUserId === targetId)
            throw new BadRequestError("You cannot unblock yourself.");

        const removed = await this.blockRepository.unblock(
            currentUserId,
            targetId,
        );

        return { isBlocked: false, removed };
    }
}
