import { BadRequestError, NotFoundError } from "@core/errors";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { TransactionPort } from "@core/ports/services/transaction.port";
import type { BlockUserUseCaseInput } from "./block-user-usecase.input";
import type { BlockUserUseCaseOutput } from "./block-user-usecase.output";

/**
 * Use case for blocking another user.
 *
 * Blocking is stored one way but takes effect both ways: from here on neither
 * account sees the other's posts, profile counts, notifications or messages.
 * Nothing is deleted - the thread they may already have, and everything either
 * of them wrote, survives an unblock intact.
 */
export class BlockUserUseCase {
    /**
     * Creates a new instance of BlockUserUseCase.
     *
     * @param transactionService - Service for handling database transactions
     * @param userRepository - Repository used to check the target exists
     */
    constructor(
        private readonly transactionService: TransactionPort,
        private readonly userRepository: IUserRepository,
    ) {}

    /**
     * Blocks a user, tearing down any follow relationship in either direction.
     *
     * Idempotent: blocking somebody already blocked reports the existing block
     * rather than failing, which is what a double tap and a retry both need.
     *
     * @param input - Who is blocking whom
     * @returns The resulting state, and whether this call created it
     *
     * @throws BadRequestError - When a user tries to block themselves
     * @throws NotFoundError - When the target does not exist or is being deleted
     *
     * @remarks
     * The block and the two unfollows are one transaction. Committing the
     * block on its own would leave the pair still following each other while
     * invisible to each other, and a follower list nobody can act on: the
     * unfollow endpoint is one of the things a block closes off.
     *
     * The follows are dropped in both directions because the feature is
     * symmetric. Leaving the blocker's own follow standing would keep feeding
     * a `followedOnly` query rows it then has to filter out again, and would
     * quietly restore the relationship the moment the block was lifted.
     */
    async execute(
        input: BlockUserUseCaseInput,
    ): Promise<BlockUserUseCaseOutput> {
        const { currentUserId, targetId } = input;

        if (currentUserId === targetId)
            throw new BadRequestError("You cannot block yourself.");

        const target = await this.userRepository.findById(targetId);

        if (!target || target.deletedAt !== null)
            throw new NotFoundError("User not found.");

        const created = await this.transactionService.runInTransaction(
            async (ctx) => {
                const wrote = await ctx.blockRepository.block(
                    currentUserId,
                    targetId,
                );

                // Unconditionally, not only when the block is new: a block
                // written by an earlier call that failed partway must still
                // converge on the same state.
                await ctx.followUserRepository.unfollowUser(
                    currentUserId,
                    targetId,
                );
                await ctx.followUserRepository.unfollowUser(
                    targetId,
                    currentUserId,
                );

                return wrote;
            },
        );

        return { isBlocked: true, created };
    }
}
