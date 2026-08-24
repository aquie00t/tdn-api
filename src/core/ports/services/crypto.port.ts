/**
 * Port interface for cryptographic utility operations.
 */
export interface CryptoPort {
    /**
     * Generates a numeric one-time password (OTP).
     *
     * @param length - The number of digits in the OTP. Defaults to a predefined length if omitted.
     * @returns A string of random numeric digits.
     */
    generateOtp(length?: number): string;

    /**
     * Hashes a given OTP for secure storage or comparison.
     *
     * @param otp - The plain-text OTP to hash.
     * @returns The hashed representation of the OTP.
     */
    hashOtp(otp: string): string;

    /**
     * Generates a cryptographically secure random hexadecimal string.
     *
     * @param bytes - The number of random bytes to generate.
     * @returns A hex-encoded string of the specified byte length.
     */
    generateRandomHex(bytes: number): string;

    /**
     * Generates a random UUID.
     *
     * @returns A version 4 UUID string.
     */
    generateUuid(): string;

    /**
     * Compares two strings in constant time to prevent timing attacks.
     *
     * @param a - First string to compare.
     * @param b - Second string to compare.
     * @returns True if the strings are equal, false otherwise.
     */
    timingSafeEqual(a: string, b: string): boolean;
}
