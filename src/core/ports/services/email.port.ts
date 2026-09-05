import type {
    DailyDigestEmail,
    DigestSendResult,
} from "@core/domain/interfaces/digest.interface";
import type {
    ReportAlertEmail,
    ReportDigestEmail,
} from "@core/domain/interfaces/report.interface";

/**
 * Base input structure for sending an email.
 */
export interface EmailInput {
    /** The recipient's email address. */
    to: string;
}

/**
 * Input structure for sending an email that contains a one-time password (OTP).
 */
export interface OtpEmailInput extends EmailInput {
    /** The one-time password to include in the email. */
    otp: string;
}

/**
 * Port interface for email delivery operations.
 */
export interface EmailPort {
    /**
     * Sends an email containing an OTP for account verification.
     *
     * @param input - The recipient address and OTP code.
     * @returns A promise that resolves when the email has been sent.
     */
    sendVerificationEmail(input: OtpEmailInput): Promise<void>;

    /**
     * Sends an email containing an OTP for password reset.
     *
     * @param input - The recipient address and OTP code.
     * @returns A promise that resolves when the email has been sent.
     */
    sendPasswordResetEmail(input: OtpEmailInput): Promise<void>;

    /**
     * Sends a confirmation email notifying the user that their account has been deleted.
     *
     * @param input - The recipient address.
     * @returns A promise that resolves when the email has been sent.
     */
    sendDeleteUserEmail(input: EmailInput): Promise<void>;

    /**
     * Sends a morning digest to many recipients at once.
     *
     * Unlike the transactional methods above, this one reports what happened.
     * They send one email in response to something the user just did, and a
     * failure surfaces as the user not receiving it; a digest run sends
     * thousands unattended, and a run that cannot tell success from silence is
     * indistinguishable from one that is quietly delivering nothing.
     *
     * @param digests - One assembled digest per recipient.
     * @returns How many the provider accepted, and which it refused.
     */
    sendDailyDigests(digests: DailyDigestEmail[]): Promise<DigestSendResult>;

    /**
     * Tells the operator that one piece of content just crossed the reporting
     * threshold.
     *
     * The only report mail that interrupts: everything below the threshold
     * waits for the morning summary. A moderation address that pings on every
     * single report is one people stop reading, which costs more than a slow
     * response to the reports that matter.
     *
     * @param input - The escalated content and what was said about it.
     * @returns A promise that resolves when the email has been handed over.
     */
    sendReportAlert(input: ReportAlertEmail): Promise<void>;

    /**
     * Sends the operator the morning summary of open reports.
     *
     * @param input - The open queue, collected per target.
     * @returns A promise that resolves when the email has been handed over.
     */
    sendReportDigest(input: ReportDigestEmail): Promise<void>;
}
