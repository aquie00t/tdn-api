import {
    AccountBannedError,
    BadRequestError,
    UnauthorizedError,
} from "@core/errors";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { IVerificationTokenRepository } from "@core/ports/repositories/verification-token.repository";
import { TokenType } from "@core/domain/enums/token-type.enum";
import { type CryptoPort } from "@core/ports/services/crypto.port";
import type { TransactionPort } from "@core/ports/services/transaction.port";
import type { VerifyEmailInput } from "./verify-email.input";
/**
 * Use case for verifying a user's email address using a one-time password (OTP)
 * This is typically part of the email verification flow after a user registers or requests email verification
 * The use case checks the provided OTP against the stored verification token for the user, verifies the email if valid, and handles error cases such as invalid or expired tokens.
 */
export class VerifyEmailUseCase {
    /**
     * @param userRepository - Repository for accessing user data
     * @param verificationTokenRepository - Repository for accessing verification tokens
     * @param cryptoService - Service for hashing and comparing OTPs
     * @remarks The constructor injects the necessary dependencies for the use case, including repositories for users and verification tokens, as well as a crypto service for handling OTP hashing. This allows the use case to perform its operations without being tightly coupled to specific implementations of these dependencies, facilitating easier testing and maintenance.
     */
    constructor(
        private readonly userRepository: IUserRepository,
        private readonly verificationTokenRepository: IVerificationTokenRepository,
        private readonly cryptoService: CryptoPort,
        private readonly transactionService: TransactionPort,
    ) {}
    /**
     * Executes the email verification process for a user based on the provided input
     * @param input - The input containing the user ID and the OTP to verify
     * @throws UnauthorizedError if the user is not found or is deleted
     * @throws BadRequestError if the verification token is invalid, expired, or if the OTP does not match
     * @returns void if the email is successfully verified or if it was already verified
     */
    async execute(input: VerifyEmailInput): Promise<void> {
        const user = await this.userRepository.findById(input.userId);

        if (user?.isBanned()) {
            throw new AccountBannedError();
        }

        if (!user || user.isDeleted()) {
            throw new UnauthorizedError("Unauthorized access.");
        }

        if (user.isEmailVerified) {
            return;
        }

        const verificationToken =
            await this.verificationTokenRepository.findByUserIdAndType(
                user.id,
                TokenType.EMAIL_VERIFICATION,
            );

        if (!verificationToken) {
            throw new BadRequestError("Invalid verification code.");
        }

        if (verificationToken.isExpired()) {
            throw new BadRequestError(
                "Verification code has expired. Please request a new one.",
            );
        }

        const hashedInputOtp = this.cryptoService.hashOtp(input.otp);
        if (
            !this.cryptoService.timingSafeEqual(
                hashedInputOtp,
                verificationToken.tokenHash,
            )
        ) {
            throw new BadRequestError("Invalid verification code.");
        }

        user.verifyEmail();

        await this.transactionService.runInTransaction(async (ctx) => {
            await ctx.userRepository.update(user);
            await ctx.verificationTokenRepository.delete(verificationToken.id);
        });
    }
}
