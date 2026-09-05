import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import type { EncryptionPort } from "@core/ports/services/encryption.port";

/** Bytes of key AES-256 takes. */
const KEY_BYTES = 32;

/** Nonce length GCM is specified for; a different one weakens it. */
const IV_BYTES = 12;

/** Bytes of authentication tag GCM produces. */
const TAG_BYTES = 16;

/**
 * AES-256-GCM implementation of {@link EncryptionPort}.
 *
 * GCM rather than CBC because it authenticates: a payload someone edited in the
 * database fails to decrypt instead of returning text that was never written.
 * For a column holding what people said to each other, silently returning
 * altered text would be the worse failure of the two.
 *
 * The stored payload is `iv || ciphertext || tag`, base64. The nonce travels
 * with the ciphertext because it has to be known to decrypt and is not secret -
 * only its uniqueness matters, and it is drawn fresh from the CSPRNG each time.
 */
export class AesGcmEncryptionService implements EncryptionPort {
    private readonly key: Buffer;

    /**
     * Creates a new AesGcmEncryptionService instance.
     *
     * @param messageEncryptionKey - The key, base64-encoded, 32 bytes decoded.
     *
     * @throws When the key is missing or not 32 bytes. Thrown here, at
     * construction, so a bad key takes the service down at boot rather than
     * surfacing as a 500 the first time somebody sends a message - and rather
     * than letting it start and write rows nothing can read back.
     */
    constructor(messageEncryptionKey: string) {
        const key = Buffer.from(messageEncryptionKey ?? "", "base64");

        if (key.length !== KEY_BYTES) {
            throw new Error(
                `MESSAGE_ENCRYPTION_KEY must be ${KEY_BYTES} bytes, base64-encoded; got ${key.length}.`,
            );
        }

        this.key = key;
    }

    /**
     * Encrypts a string for storage.
     *
     * @param plaintext - The value to protect.
     * @returns The base64 payload.
     */
    encrypt(plaintext: string): string {
        const iv = randomBytes(IV_BYTES);
        const cipher = createCipheriv("aes-256-gcm", this.key, iv);

        const ciphertext = Buffer.concat([
            cipher.update(plaintext, "utf8"),
            cipher.final(),
        ]);

        return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString(
            "base64",
        );
    }

    /**
     * Recovers a string produced by {@link encrypt}.
     *
     * @param payload - The stored payload.
     * @returns The original plaintext.
     * @throws When the payload is malformed, truncated, or was altered.
     */
    decrypt(payload: string): string {
        const raw = Buffer.from(payload, "base64");

        // Checked before slicing: Buffer.subarray clamps out-of-range offsets
        // rather than failing, so a truncated payload would otherwise reach the
        // cipher as a short key-and-tag pair and fail with something far less
        // legible than this.
        if (raw.length < IV_BYTES + TAG_BYTES) {
            throw new Error("Encrypted payload is too short to be valid.");
        }

        const iv = raw.subarray(0, IV_BYTES);
        const tag = raw.subarray(raw.length - TAG_BYTES);
        const ciphertext = raw.subarray(IV_BYTES, raw.length - TAG_BYTES);

        const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
        decipher.setAuthTag(tag);

        return Buffer.concat([
            decipher.update(ciphertext),
            decipher.final(),
        ]).toString("utf8");
    }
}
