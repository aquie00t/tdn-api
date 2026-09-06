import { BadRequestError } from "@core/errors";
import { NotFoundError } from "@core/errors/common/not-found.error";
import type { EmailPort } from "@core/ports/services/email.port";
import type { PasswordPort } from "@core/ports/services/password.port";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { RevokeSubscriptionUseCase } from "@core/use-cases/billing/revoke-subscription";
import type { SoftDeleteUserUseCaseInput } from "./soft-delete-user-usecase.input";

/**
 * Use case for soft deleting a user account.
 *
 * This use case handles the process of marking a user account as deleted
 * while preserving the data for a grace period, including password validation
 * and sending a confirmation email.
 */
export class SoftDeleteUserUseCase {
    /**
     * Creates a new instance of SoftDeleteUserUseCase.
     *
     * @param userRepository - Repository for managing user data
     * @param passwordService - Service for password verification
     * @param emailService - Service for sending emails
     * @param revokeSubscriptionUseCase - Stops the account being charged
     */
    constructor(
        private readonly userRepository: IUserRepository,
        private readonly passwordService: PasswordPort,
        private readonly emailService: EmailPort,
        private readonly revokeSubscriptionUseCase: RevokeSubscriptionUseCase,
    ) {}

    /**
     * Executes the soft delete process for a user account.
     *
     * @param input - Input containing user ID and password for validation
     * @returns Promise<void> - Resolves when soft delete is complete
     *
     * @throws NotFoundError - When the user is not found or cannot be deleted
     * @throws BadRequestError - When the provided password is invalid
     *
     * @remarks
     * This method validates the user's password, marks the account as deleted
     * with a future deletion date, and sends a confirmation email to the user.
     * Only users with password-based accounts can be deleted (not OAuth users).
     */
    async execute(input: SoftDeleteUserUseCaseInput): Promise<void> {
        const user = await this.userRepository.findById(input.id);

        if (!user || user.deletedAt !== null || !user.passwordHash)
            throw new NotFoundError("The user cannot be deleted.");

        const isPasswordValid = await this.passwordService.verify(
            input.password,
            user.passwordHash,
        );

        if (!isPasswordValid) throw new BadRequestError("Invalid password.");

        await this.userRepository.softDeleteById(input.id);

        // Awaited, not fired and forgotten: this platform promises that a
        // deleted account stops being charged, and a promise about somebody's
        // money is not something to lose to a dropped promise. It cancels at
        // the provider immediately rather than at the end of the period,
        // because the account is going away either way.
        //
        // The nightly reconcile retries anything the provider refused, which
        // is why a failure here does not have to stop the deletion.
        await this.revokeSubscriptionUseCase.execute(input.id);

        await this.emailService.sendDeleteUserEmail({
            to: user.email,
        });
    }
}
