import { config } from "dotenv";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { AesGcmEncryptionService } from "../../../src/infrastructure/security/aes-gcm-encryption.service";

/**
 * Creates a PrismaClient instance connected to the integration test database.
 * Reads DATABASE_URL from .env.test.
 */
export function createPrismaClient(): PrismaClient {
    const { parsed } = config({ path: ".env.test" });
    const connectionString = parsed?.DATABASE_URL ?? process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error("DATABASE_URL is not set in .env.test");
    }

    const adapter = new PrismaPg({ connectionString });
    return new PrismaClient({ adapter });
}

/**
 * Builds the cipher the message and conversation repositories take.
 *
 * Reads the same key the API would, so a row written by a test is readable by
 * the running service and vice versa. Falls back to a fixed throwaway key when
 * the env does not carry one, so a repository test never fails for a reason
 * that has nothing to do with what it is testing.
 */
export function createEncryptionService(): AesGcmEncryptionService {
    const { parsed } = config({ path: ".env.test" });
    const key =
        parsed?.MESSAGE_ENCRYPTION_KEY ??
        process.env.MESSAGE_ENCRYPTION_KEY ??
        Buffer.from("tdn-integration-test-key-32bytes").toString("base64");

    return new AesGcmEncryptionService(key);
}
