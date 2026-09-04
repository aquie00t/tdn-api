import { UnauthorizedError } from "@core/errors";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import { verifyUnsubscribeToken } from "@core/use-cases/shared/digest/unsubscribe-token";
import type { UnsubscribeDigestInput } from "./unsubscribe-digest.input";

/**
 * Use case for leaving, or rejoining, the daily digest.
 *
 * Reached from a link in an email, so there is no session to lean on: the
 * signature in the link is the entire proof, and it is checked before anything
 * is written.
 */
export class UnsubscribeDigestUseCase {
    /**
     * Creates a new instance of UnsubscribeDigestUseCase.
     *
     * @param userRepository - Repository holding the opt-out flag
     * @param unsubscribeSecret - Key the link signature is verified against
     */
    constructor(
        private readonly userRepository: IUserRepository,
        private readonly unsubscribeSecret: string,
    ) {}

    /**
     * Applies the reader's choice.
     *
     * @param input - The account, the signature, and what to do
     * @returns Whether the account is subscribed once this is done
     *
     * @throws UnauthorizedError - When the signature is not this account's
     *
     * @remarks
     * A bad signature and an unknown account answer the same way. Telling them
     * apart would turn the endpoint into a check for whether a given id has an
     * account here, which is not something an unauthenticated caller should be
     * able to ask.
     */
    async execute(input: UnsubscribeDigestInput): Promise<boolean> {
        const isValid = verifyUnsubscribeToken(
            input.userId,
            input.token,
            this.unsubscribeSecret,
        );

        if (!isValid) {
            throw new UnauthorizedError("This unsubscribe link is not valid.");
        }

        const user = await this.userRepository.findById(input.userId);

        if (!user) {
            throw new UnauthorizedError("This unsubscribe link is not valid.");
        }

        const subscribing = input.action === "resubscribe";

        await this.userRepository.setDigestOptOut(
            user.id,
            subscribing ? null : new Date(),
        );

        return subscribing;
    }
}
