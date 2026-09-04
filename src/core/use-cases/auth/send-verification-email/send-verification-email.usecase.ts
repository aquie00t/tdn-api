import { AccountBannedError, UnauthorizedError } from "@core/errors";
import type { EmailPort } from "@core/ports/services/email.port";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import { TokenType } from "@core/domain/enums/token-type.enum";
import type { IVerificationTokenRepository } from "@core/ports/repositories/verification-token.repository";
import type { CryptoPort } from "@core/ports/services/crypto.port";
import type { SendVerificationEmailInput } from "./send-verification-email.input";

/**
 * Use case for sending email verification to a user.
 *
 * This use case handles the process of generating a verification OTP
 * and sending it to the user's email address.
 */
export class SendVerificationEmailUseCase {
    /**
     * Creates a new instance of SendVerificationEmailUseCase.
     *
     * @param userRepository - Repository for managing user data
     * @param verificationTokenRepository - Repository for managing verification tokens
     * @param emailService - Service for sending emails
     * @param cryptoService - Service for cryptographic operations
     */
    constructor(
        private readonly userRepository: IUserRepository,
        private readonly verificationTokenRepository: IVerificationTokenRepository,
        private readonly emailService: EmailPort,
        private readonly cryptoService: CryptoPort,
        private readonly otpExpirySeconds: number = 10 * 60,
    ) {}

    /**
     * Executes the email verification sending process.
     *
     * @param input - Input containing the user ID for verification
     * @returns Promise<void> - Resolves when email is sent
     *
     * @throws UnauthorizedError - When user is not found or deleted
     *
     * @remarks
     * If the user's email is already verified, the method returns silently.
     * Otherwise, it generates a new OTP and sends it via email.
     */
    async execute(input: SendVerificationEmailInput): Promise<void> {
        const user = await this.userRepository.findById(input.userId);

        if (user?.isBanned()) {
            throw new AccountBannedError();
        }

        if (!user || user.isDeleted()) {
            throw new UnauthorizedError("User not found");
        }

        if (user.isEmailVerified) {
            return;
        }

        const plainOtp = this.cryptoService.generateOtp(8);

        const hashedOtp = this.cryptoService.hashOtp(plainOtp);

        const expiresAt = new Date(Date.now() + this.otpExpirySeconds * 1000);

        await this.verificationTokenRepository.upsert({
            userId: user.id,
            tokenHash: hashedOtp,
            type: TokenType.EMAIL_VERIFICATION,
            expiresAt,
        });

        await this.emailService.sendVerificationEmail({
            to: user.email,
            otp: plainOtp,
        });
    }
}
