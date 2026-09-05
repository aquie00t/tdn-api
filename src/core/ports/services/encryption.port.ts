/**
 * Port interface for symmetric encryption of data held at rest.
 *
 * Separate from {@link CryptoPort}, which generates and hashes one-time values
 * and never needs to get anything back. This one is reversible and holds a key,
 * which is a different responsibility and a different blast radius.
 *
 * What it protects: a database dump, a backup file, somebody browsing the rows
 * through a console, a leaked connection string. What it does not protect: an
 * attacker who reaches the running service, because the key is there with it.
 * That is end-to-end encryption's job, not this one's.
 */
export interface EncryptionPort {
    /**
     * Encrypts a string for storage.
     *
     * The same input encrypts to a different payload every time - the nonce is
     * random - so ciphertext cannot be compared for equality or used to tell
     * that two rows hold the same text.
     *
     * @param plaintext - The value to protect.
     * @returns An opaque payload, safe to store in a text column.
     */
    encrypt(plaintext: string): string;

    /**
     * Recovers a string produced by {@link encrypt}.
     *
     * @param payload - The stored payload.
     * @returns The original plaintext.
     * @throws When the payload is malformed, truncated, or was altered - the
     * cipher is authenticated, so a modified payload fails rather than
     * returning wrong text.
     */
    decrypt(payload: string): string;
}
