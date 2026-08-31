/* eslint-disable no-console */
/**
 * @module scripts/backfill-post-lang
 * @description Labels existing posts with the language they were written in.
 *
 * `posts.lang` ships nullable and is filled in on write from that migration
 * onwards, which leaves every post that predates it unlabelled. The feed ranks
 * an unlabelled post as language-neutral, so nothing breaks - but until this
 * has run, the whole archive sits in that neutral band and a Turkish reader
 * gets no Turkish preference out of it.
 *
 * Runs the same in-process detector the write path uses, so a backfilled post
 * is labelled exactly as it would have been had it been written today. Posts
 * whose language the detector cannot call are left null rather than guessed
 * at, which also means a second run reconsiders them for free.
 *
 * Prerequisites:
 *   - The `add_post_lang_and_profile_languages` migration is deployed
 *     (`pnpm db:deploy`).
 *   - `.env.$NODE_ENV` points at the database to backfill. This writes to
 *     every post in it; NODE_ENV defaults to development.
 *
 * Usage:
 *   pnpm backfill-post-lang -- --dry-run     # count and sample, write nothing
 *   pnpm backfill-post-lang                  # label every unlabelled post
 *   pnpm backfill-post-lang -- --all         # relabel, including labelled posts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { HeuristicLanguageDetectionService } from "../src/infrastructure/external/heuristic-language-detection.service";

/** Rows read per round trip. Large enough to be quick, small enough to stream. */
const BATCH_SIZE = 500;

/** How many detected samples a dry run prints before it stops narrating. */
const DRY_RUN_SAMPLES = 20;

const dryRun = process.argv.includes("--dry-run");
const relabelAll = process.argv.includes("--all");

const { parsed } = config({
    path: `.env.${process.env.NODE_ENV ?? "development"}`,
});
const connectionString = parsed?.DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error(
        `DATABASE_URL is not set in .env.${process.env.NODE_ENV ?? "development"}`,
    );
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const detector = new HeuristicLanguageDetectionService();

/**
 * Walks the posts in batches and writes the detected language onto each.
 *
 * Paginates by id rather than by offset: the table is being written to while
 * this runs, and an offset would silently skip rows as earlier ones shift.
 *
 * @returns A tally of what was seen and what was written.
 */
async function backfill(): Promise<{
    scanned: number;
    labelled: number;
    undetected: number;
}> {
    const where = relabelAll ? {} : { lang: null };

    let cursor: string | undefined;
    let scanned = 0;
    let labelled = 0;
    let undetected = 0;
    let samplesPrinted = 0;

    for (;;) {
        const batch = await prisma.post.findMany({
            where,
            select: { id: true, content: true },
            orderBy: { id: "asc" },
            take: BATCH_SIZE,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });

        if (batch.length === 0) break;

        for (const post of batch) {
            scanned++;
            const lang = await detector.detect(post.content);

            if (!lang) {
                undetected++;
                continue;
            }

            labelled++;

            if (dryRun) {
                if (samplesPrinted < DRY_RUN_SAMPLES) {
                    samplesPrinted++;
                    const preview = post.content
                        .replace(/\s+/g, " ")
                        .slice(0, 70);
                    console.log(`  [${lang}] ${preview}`);
                }
                continue;
            }

            await prisma.post.update({
                where: { id: post.id },
                data: { lang },
            });
        }

        cursor = batch[batch.length - 1].id;
        console.log(`scanned ${scanned}, labelled ${labelled}`);
    }

    return { scanned, labelled, undetected };
}

async function main(): Promise<void> {
    console.log(
        `Backfilling post languages (${dryRun ? "dry run" : "writing"}, ${
            relabelAll ? "every post" : "unlabelled posts only"
        })`,
    );

    const { scanned, labelled, undetected } = await backfill();

    console.log("---");
    console.log(`scanned:    ${scanned}`);
    console.log(`labelled:   ${labelled}`);
    console.log(`undetected: ${undetected} (left null, reconsidered next run)`);
}

main()
    .catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => {
        void prisma.$disconnect();
    });
