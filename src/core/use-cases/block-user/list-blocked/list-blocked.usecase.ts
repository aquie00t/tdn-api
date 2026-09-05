import type { IBlockRepository } from "@core/ports/repositories/block.repository";
import type { ListBlockedUseCaseInput } from "./list-blocked-usecase.input";
import type { ListBlockedUseCaseOutput } from "./list-blocked-usecase.output";

/**
 * Use case for reading the accounts a user has blocked.
 *
 * Backs the settings screen, which is the only way to find a block again: a
 * blocked account is invisible everywhere else by design, so without this list
 * there would be no route back to the unblock button.
 */
export class ListBlockedUseCase {
    /**
     * Creates a new instance of ListBlockedUseCase.
     *
     * @param blockRepository - Repository for reading blocks
     */
    constructor(private readonly blockRepository: IBlockRepository) {}

    /**
     * Reads one page of the caller's block list.
     *
     * @param input - The caller and the page they asked for
     * @returns The page and the total number of blocks they hold
     */
    async execute(
        input: ListBlockedUseCaseInput,
    ): Promise<ListBlockedUseCaseOutput> {
        const [users, total] = await Promise.all([
            this.blockRepository.listBlocked(
                input.currentUserId,
                input.limit,
                input.offset,
            ),
            this.blockRepository.countBlocked(input.currentUserId),
        ]);

        return { users, total };
    }
}
