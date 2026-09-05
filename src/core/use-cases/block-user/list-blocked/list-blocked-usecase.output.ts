import type { BlockedUserSummary } from "@core/ports/repositories/block.repository";

/**
 * Output DTO for the ListBlockedUseCase.
 */
export interface ListBlockedUseCaseOutput {
    /**
     * One page of blocked accounts, newest block first.
     *
     * No `isFollowing` here, unlike the follower lists: a block tears down
     * both follows on the way in, so the answer is always false and the field
     * would only invite a client to render a follow button on a screen where
     * it cannot work.
     */
    users: BlockedUserSummary[];

    /**
     * How many accounts this user has blocked in total, so the client can page.
     */
    total: number;
}
