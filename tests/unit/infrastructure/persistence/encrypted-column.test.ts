import { describe, expect, it, vi } from "vitest";
import type { EncryptionPort } from "@core/ports/services/encryption.port";
import {
    decryptColumn,
    decryptNullableColumn,
    encryptColumn,
    EncVersion,
} from "@infrastructure/persistence/encryption/encrypted-column";

const buildCipher = (): EncryptionPort => ({
    encrypt: vi.fn((plaintext: string) => `enc(${plaintext})`),
    decrypt: vi.fn((payload: string) => payload.replace(/^enc\((.*)\)$/, "$1")),
});

describe("encrypted column", () => {
    describe("encryptColumn", () => {
        it("should encrypt and stamp the server version", () => {
            const cipher = buildCipher();

            expect(encryptColumn(cipher, "hello")).toEqual({
                value: "enc(hello)",
                encVersion: EncVersion.SERVER,
            });
        });
    });

    describe("decryptColumn", () => {
        it("should return a plaintext row untouched", () => {
            const cipher = buildCipher();

            // Rows written before encryption existed. Reading them as-is is
            // what lets the column ship ahead of the backfill.
            expect(
                decryptColumn(cipher, "old message", EncVersion.PLAINTEXT),
            ).toBe("old message");
            expect(cipher.decrypt).not.toHaveBeenCalled();
        });

        it("should decrypt a server-encrypted row", () => {
            const cipher = buildCipher();

            expect(decryptColumn(cipher, "enc(hello)", EncVersion.SERVER)).toBe(
                "hello",
            );
        });

        it("should pass a client-encrypted row through untouched", () => {
            const cipher = buildCipher();

            // The server has no key for this one; the client it is served to
            // does. Handled already so end-to-end encryption is a change to
            // the write path alone.
            expect(decryptColumn(cipher, "opaque", EncVersion.CLIENT)).toBe(
                "opaque",
            );
            expect(cipher.decrypt).not.toHaveBeenCalled();
        });

        it("should throw on a version it does not know", () => {
            // A row from a newer deploy must not be handed over as though it
            // were plaintext - that would render a base64 blob as somebody's
            // message.
            expect(() => decryptColumn(buildCipher(), "value", 99)).toThrow(
                /Unknown encryption version/,
            );
        });
    });

    describe("decryptNullableColumn", () => {
        it("should keep null as null", () => {
            const cipher = buildCipher();

            expect(
                decryptNullableColumn(cipher, null, EncVersion.SERVER),
            ).toBeNull();
            expect(cipher.decrypt).not.toHaveBeenCalled();
        });

        it("should decrypt a present value", () => {
            expect(
                decryptNullableColumn(
                    buildCipher(),
                    "enc(preview)",
                    EncVersion.SERVER,
                ),
            ).toBe("preview");
        });
    });
});
