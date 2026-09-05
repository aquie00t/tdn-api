import { describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import { AesGcmEncryptionService } from "@infrastructure/security/aes-gcm-encryption.service";

const KEY = randomBytes(32).toString("base64");

describe("AesGcmEncryptionService", () => {
    const service = new AesGcmEncryptionService(KEY);

    describe("key validation", () => {
        it("should reject a key that is not 32 bytes", () => {
            expect(
                () =>
                    new AesGcmEncryptionService(
                        randomBytes(16).toString("base64"),
                    ),
            ).toThrow(/32 bytes/);
        });

        it("should reject an empty key", () => {
            // Thrown at construction rather than on first use: a service that
            // booted with a bad key would write rows nothing can read back.
            expect(() => new AesGcmEncryptionService("")).toThrow(/32 bytes/);
        });
    });

    describe("round trip", () => {
        it("should recover the original text", () => {
            const plaintext = "merhaba, nasılsın?";

            expect(service.decrypt(service.encrypt(plaintext))).toBe(plaintext);
        });

        it("should handle an empty string", () => {
            // Media-only messages carry no text, and they go through the same
            // column as everything else.
            expect(service.decrypt(service.encrypt(""))).toBe("");
        });

        it("should survive multi-byte characters", () => {
            const plaintext = "🔐 çğıöşü — Ελληνικά — 日本語";

            expect(service.decrypt(service.encrypt(plaintext))).toBe(plaintext);
        });

        it("should survive a long message", () => {
            const plaintext = "a".repeat(10_000);

            expect(service.decrypt(service.encrypt(plaintext))).toBe(plaintext);
        });
    });

    describe("ciphertext", () => {
        it("should not contain the plaintext", () => {
            const payload = service.encrypt("secret message");

            expect(payload).not.toContain("secret");
            expect(
                Buffer.from(payload, "base64").toString("utf8"),
            ).not.toContain("secret");
        });

        it("should differ every time for the same input", () => {
            // The nonce is random, so equal ciphertexts cannot be used to tell
            // that two rows hold the same text.
            const first = service.encrypt("same text");
            const second = service.encrypt("same text");

            expect(first).not.toBe(second);
            expect(service.decrypt(first)).toBe(service.decrypt(second));
        });
    });

    describe("authentication", () => {
        it("should refuse a payload whose ciphertext was altered", () => {
            const raw = Buffer.from(service.encrypt("original"), "base64");
            // A byte in the middle: past the nonce, before the tag.
            raw[raw.length - 20] ^= 0xff;

            expect(() => service.decrypt(raw.toString("base64"))).toThrow();
        });

        it("should refuse a payload whose tag was altered", () => {
            const raw = Buffer.from(service.encrypt("original"), "base64");
            raw[raw.length - 1] ^= 0xff;

            expect(() => service.decrypt(raw.toString("base64"))).toThrow();
        });

        it("should refuse a truncated payload with a legible error", () => {
            expect(() => service.decrypt("AAAA")).toThrow(/too short/);
        });

        it("should refuse a payload written under a different key", () => {
            const other = new AesGcmEncryptionService(
                randomBytes(32).toString("base64"),
            );

            expect(() => service.decrypt(other.encrypt("hello"))).toThrow();
        });
    });
});
