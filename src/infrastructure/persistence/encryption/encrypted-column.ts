import type { EncryptionPort } from "@core/ports/services/encryption.port";

/**
 * How an encrypted column's stored value is encoded.
 *
 * The number lives in its own column beside the value. A prefix on the string
 * would have been cheaper, but a plaintext message that happened to start with
 * that prefix would be mistaken for ciphertext and fail to decrypt.
 */
export const EncVersion = {
    /**
     * Written before encryption existed. Read back as-is.
     *
     * Rows keep this until the backfill reaches them, which is what lets the
     * column ship ahead of the backfill instead of needing one deploy to do
     * both.
     */
    PLAINTEXT: 0,

    /** AES-256-GCM under the server key. Encrypted and decrypted here. */
    SERVER: 1,

    /**
     * Encrypted by the client under a key the server does not have.
     *
     * Nothing writes this yet - it is the shape end-to-end encryption will
     * take. It is handled on the read path already so that adding it later is
     * a change to the write path alone.
     */
    CLIENT: 2,
} as const;

/**
 * The value and version to store for a piece of text.
 *
 * @param encryptionService - The cipher to use.
 * @param plaintext - The text being stored.
 * @returns The column value and the version that describes it.
 */
export function encryptColumn(
    encryptionService: EncryptionPort,
    plaintext: string,
): { value: string; encVersion: number } {
    return {
        value: encryptionService.encrypt(plaintext),
        encVersion: EncVersion.SERVER,
    };
}

/**
 * Reads a stored value back according to its version.
 *
 * @param encryptionService - The cipher to use.
 * @param value - The stored column value.
 * @param encVersion - The version column beside it.
 * @returns The text to hand the domain. For a client-encrypted value that is
 * the ciphertext itself: the server cannot read it, and the client it is served
 * to can.
 *
 * @throws When the version is not one this build knows. Failing is deliberate -
 * a row written by a newer deploy must not be handed to a reader as though it
 * were plaintext, because that reader would show a base64 blob as somebody's
 * message.
 */
export function decryptColumn(
    encryptionService: EncryptionPort,
    value: string,
    encVersion: number,
): string {
    switch (encVersion) {
        case EncVersion.PLAINTEXT:
        case EncVersion.CLIENT:
            return value;
        case EncVersion.SERVER:
            return encryptionService.decrypt(value);
        default:
            throw new Error(
                `Unknown encryption version ${encVersion}; this build cannot read the row.`,
            );
    }
}

/**
 * The nullable form, for a column that is absent until a thread has a message.
 *
 * @param encryptionService - The cipher to use.
 * @param value - The stored column value, or null.
 * @param encVersion - The version column beside it.
 * @returns The text, or null when there was none.
 */
export function decryptNullableColumn(
    encryptionService: EncryptionPort,
    value: string | null,
    encVersion: number,
): string | null {
    return value === null
        ? null
        : decryptColumn(encryptionService, value, encVersion);
}
