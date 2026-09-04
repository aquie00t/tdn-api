import { AccountBannedError, BadRequestError } from "@core/errors";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { IVerificationTokenRepository } from "@core/ports/repositories/verification-token.repository";
import type { PasswordPort } from "@core/ports/services/password.port";
import { TokenType } from "@core/domain/enums/token-type.enum";
import type { CryptoPort } from "@core/ports/services/crypto.port";
import type { TransactionPort } from "@core/ports/services/transaction.port";
import type { ResetPasswordInput } from "./reset-password.input";

/**
 * Use case for resetting user password.
 *
 * This use case handles the complete password reset process including
 * OTP verification and password update.
 */
export class ResetPasswordUseCase {
    private readonly GENERIC_ERROR = "Invalid or expired reset credentials.";

    /**
     * Creates a new instance of ResetPasswordUseCase.
     *
     * @param userRepository - Repository for managing user data
     * @param verificationTokenRepository - Repository for managing verification tokens
     * @param passwordService - Service for password hashing
     * @param cryptoService - Service for cryptographic operations
     */
    constructor(
        private readonly userRepository: IUserRepository,
        private readonly verificationTokenRepository: IVerificationTokenRepository,
        private readonly passwordService: PasswordPort,
        private readonly cryptoService: CryptoPort,
        private readonly transactionService: TransactionPort,
    ) {}

    /**
     * Executes the password reset process.
     *
     * @param input - Reset password input containing email, OTP, and new password
     * @returns Promise<void> - Resolves when password reset is complete
     *
     * @throws BadRequestError - When reset credentials are invalid or expired
     *
     * @remarks
     * This method validates the OTP, updates the user's password, and cleans up
     * the verification token to prevent reuse.
     */
    async execute(input: ResetPasswordInput): Promise<void> {
        const user = await this.userRepository.findByEmail(input.email);

        if (user?.isBanned()) {
            throw new AccountBannedError();
        }

        if (!user || user.isDeleted()) {
            throw new BadRequestError(this.GENERIC_ERROR);
        }

        if (!user.passwordHash) {
            throw new BadRequestError(
                "This account uses an external provider (like Google or GitHub). Please log in using that provider.",
            );
        }

        const verificationToken =
            await this.verificationTokenRepository.findByUserIdAndType(
                user.id,
                TokenType.PASSWORD_RESET,
            );

        if (!verificationToken || verificationToken.isExpired()) {
            throw new BadRequestError(this.GENERIC_ERROR);
        }

        const hashedInputOtp = this.cryptoService.hashOtp(input.otp);

        if (
            !this.cryptoService.timingSafeEqual(
                hashedInputOtp,
                verificationToken.tokenHash,
            )
        ) {
            throw new BadRequestError(this.GENERIC_ERROR);
        }

        const newPasswordHash = await this.passwordService.hash(
            input.newPassword,
        );

        user.hashPassword = newPasswordHash;

        await this.transactionService.runInTransaction(async (ctx) => {
            await ctx.userRepository.update(user);
            await ctx.verificationTokenRepository.delete(verificationToken.id);
        });
    }
}
