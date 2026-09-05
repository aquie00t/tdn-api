import { UserBlockedError } from "@core/errors";
import type { IBlockRepository } from "@core/ports/repositories/block.repository";

/**
 * Refuses an action when a block stands between the two users.
 *
 * Direction is deliberately not distinguished. Blocking hides two people from
 * each other, so an action is refused whether the caller blocked the target or
 * the target blocked the caller; telling those apart here would only let the
 * caller work out which happened.
 *
 * Not for the direct-messaging gates. Those answer with their own errors,
 * which say nothing about why - see {@link UserBlockedError} for why the two
 * surfaces disagree on purpose.
 *
 * @param params - The repository to ask, and the two users
 *
 * @throws UserBlockedError - When either user has blocked the other
 */
export async function assertNotBlocked(params: {
    blockRepository: IBlockRepository;
    userId: string;
    targetId: string;
}): Promise<void> {
    const blocked = await params.blockRepository.existsBetween(
        params.userId,
        params.targetId,
    );

    if (blocked) throw new UserBlockedError();
}
