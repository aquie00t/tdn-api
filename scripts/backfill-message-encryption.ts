/* eslint-disable no-console */
/**
 * @module scripts/backfill-message-encryption
 * @description Encrypts the message text that predates encryption.
 *
 * `messages.content` and `conversations.last_message_preview` ship encrypted
 * from the `encrypt_message_content` migration onwards, but every row written
 * before it is still plaintext and marked `enc_version = 0`. The application
 * reads those correctly - that is what the version column is for - so nothing
 * is broken until this runs. What is still true until it runs is the thing
 * that prompted the work: anyone reading the table sees the old messages.
 *
 * Rows are re-read and re-checked rather than assumed, so a second run picks up
 * whatever a first one did not finish. Running it twice is safe; a row already
 * at version 1 is never touched.
 *
 * The key must be the same one the service uses. Encrypting under a different
 * key produces rows the API cannot read back, and there is no way to tell that
 * apart from corruption afterwards.
 *
 * Prerequisites:
 *   - The `encrypt_message_content` migration is deployed (`pnpm db:deploy`).
 *   - `.env.$NODE_ENV` holds the DATABASE_URL to backfill and the
 *     MESSAGE_ENCRYPTION_KEY the service runs with. NODE_ENV defaults to
 *     development.
 *
 * Usage:
 *   pnpm backfill-message-encryption -- --dry-run   # count only, write nothing
 *   pnpm backfill-message-encryption                # encrypt what is left
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { AesGcmEncryptionService } from "../src/infrastructure/security/aes-gcm-encryption.service";
import { EncVersion } from "../src/infrastructure/persistence/encryption/encrypted-column";

/** Rows read per round trip. Large enough to be quick, small enough to stream. */
const BATCH_SIZE = 500;

const dryRun = process.argv.includes("--dry-run");

const envName = process.env.NODE_ENV ?? "development";
const { parsed } = config({ path: `.env.${envName}` });

const connectionString = parsed?.DATABASE_URL ?? process.env.DATABASE_URL;
const encryptionKey =
    parsed?.MESSAGE_ENCRYPTION_KEY ?? process.env.MESSAGE_ENCRYPTION_KEY;

if (!connectionString) {
    throw new Error(`DATABASE_URL is not set in .env.${envName}`);
}

if (!encryptionKey) {
    throw new Error(`MESSAGE_ENCRYPTION_KEY is not set in .env.${envName}`);
}

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
});

// Constructed before anything is read, so a wrong-length key stops the run
// rather than being discovered halfway through the table.
const encryption = new AesGcmEncryptionService(encryptionKey);

/**
 * Encrypts every message still holding plaintext.
 *
 * Paginates by id rather than by offset: people are writing to this table while
 * the script runs, and an offset would skip rows as earlier ones shift. Each
 * row is written in its own statement with the version guarded in the `where`,
 * so a message encrypted by a concurrent run is not encrypted twice - which
 * would leave a payload that decrypts to another payload.
 *
 * @returns How many rows were seen and how many were written.
 */
async function backfillMessages(): Promise<{
    scanned: number;
    encrypted: number;
}> {
    let cursor: string | undefined;
    let scanned = 0;
    let encrypted = 0;

    for (;;) {
        const batch = await prisma.message.findMany({
            where: { encVersion: EncVersion.PLAINTEXT },
            select: { id: true, content: true },
            orderBy: { id: "asc" },
            take: BATCH_SIZE,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });

        if (batch.length === 0) break;

        for (const message of batch) {
            scanned++;

            if (dryRun) continue;

            const { count } = await prisma.message.updateMany({
                // The version is part of the predicate, not just the payload:
                // it is what makes a concurrent or repeated run a no-op
                // instead of double-encrypting the row.
                where: {
                    id: message.id,
                    encVersion: EncVersion.PLAINTEXT,
                },
                data: {
                    content: encryption.encrypt(message.content),
                    encVersion: EncVersion.SERVER,
                },
            });

            encrypted += count;
        }

        cursor = batch[batch.length - 1].id;
    }

    return { scanned, encrypted };
}

/**
 * Encrypts every inbox preview still holding plaintext.
 *
 * The preview is a copy of the newest message's text, so leaving it behind
 * would hand a reader of the table the opening of every conversation - most of
 * what encrypting the messages was for.
 *
 * A null preview belongs to a thread with no messages and is left alone; there
 * is nothing to protect and encrypting it would turn "empty" into a value.
 *
 * @returns How many rows were seen and how many were written.
 */
async function backfillPreviews(): Promise<{
    scanned: number;
    encrypted: number;
}> {
    let cursor: string | undefined;
    let scanned = 0;
    let encrypted = 0;

    for (;;) {
        const batch = await prisma.conversation.findMany({
            where: {
                previewEncVersion: EncVersion.PLAINTEXT,
                lastMessagePreview: { not: null },
            },
            select: { id: true, lastMessagePreview: true },
            orderBy: { id: "asc" },
            take: BATCH_SIZE,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });

        if (batch.length === 0) break;

        for (const conversation of batch) {
            scanned++;

            if (dryRun) continue;

            const { count } = await prisma.conversation.updateMany({
                where: {
                    id: conversation.id,
                    previewEncVersion: EncVersion.PLAINTEXT,
                },
                data: {
                    lastMessagePreview: encryption.encrypt(
                        conversation.lastMessagePreview!,
                    ),
                    previewEncVersion: EncVersion.SERVER,
                },
            });

            encrypted += count;
        }

        cursor = batch[batch.length - 1].id;
    }

    return { scanned, encrypted };
}

async function main(): Promise<void> {
    console.log(
        dryRun
            ? `Dry run against .env.${envName} — nothing will be written.`
            : `Encrypting against .env.${envName}.`,
    );

    const messages = await backfillMessages();
    const previews = await backfillPreviews();

    console.log(
        `Messages:  ${messages.scanned} plaintext, ${messages.encrypted} encrypted`,
    );
    console.log(
        `Previews:  ${previews.scanned} plaintext, ${previews.encrypted} encrypted`,
    );

    if (dryRun && messages.scanned + previews.scanned > 0) {
        console.log("\nRun again without --dry-run to encrypt them.");
    }
}

main()
    .catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => {
        void prisma.$disconnect();
    });
