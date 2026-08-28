/* eslint-disable no-console */
/**
 * @module scripts/assign-bot-categories
 * @description Assigns discovery categories to the TDN system bots.
 *
 * Onboarding asks a new user to pick their fields and then follow news bots
 * covering them, which only works once every system bot advertises what it
 * publishes about. This script walks `scripts/bot-categories.json` and sends
 * one `PATCH /profiles/me` per bot, authenticated with that bot's own token
 * from `bot-tokens-private.json` (gitignored).
 *
 * Only the 144 system bots in the mapping are touched. The persona accounts
 * that share the token file are deliberately left uncategorised so they never
 * surface in `GET /profiles/bots`.
 *
 * Prerequisites:
 *   - The `add_profile_categories` migration is deployed to the target API
 *     (`pnpm db:deploy`). Without it every profile request fails with a
 *     PrismaClientKnownRequestError.
 *   - `bot-tokens-private.json` sits in the repository root.
 *
 * Usage:
 *   pnpm assign-bot-categories -- --dry-run          # print, send nothing
 *   pnpm assign-bot-categories                       # against the default API
 *   TDN_API=http://localhost:8080/api/v1 pnpm assign-bot-categories
 *
 * The run is resumable: completed bots are recorded in
 * `scripts/.bot-categories-state.json` and skipped on the next run unless
 * `--force` is passed.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const API = process.env.TDN_API ?? "https://api.developernetwork.net/api/v1";
const TOKENS_FILE = "bot-tokens-private.json";
const MAPPING_FILE = path.join("scripts", "bot-categories.json");
const STATE_FILE = path.join("scripts", ".bot-categories-state.json");

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

/** Delay between requests. Bot tokens skip the rate limiter, so this only
 *  keeps the burst civil rather than working around a limit. */
const DELAY_MS = 150;

/** Cloudflare fronts the API and rejects unrecognised clients with a 1010. */
const USER_AGENT = "tdn-api-scripts/assign-bot-categories";

type CategoryMap = Record<string, string[]>;

const wait = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reads a JSON file relative to the repository root.
 *
 * @param file - The path to read.
 * @returns The parsed contents.
 */
function readJson<T>(file: string): T {
    return JSON.parse(readFileSync(file, "utf-8")) as T;
}

/**
 * Loads the set of bots already patched by an earlier run.
 *
 * @returns The recorded usernames, empty when --force is passed.
 */
function loadState(): Set<string> {
    if (FORCE || !existsSync(STATE_FILE)) return new Set();
    return new Set(readJson<string[]>(STATE_FILE));
}

/**
 * Persists the set of bots patched so far so the run can be resumed.
 *
 * @param done - The usernames completed so far.
 */
function saveState(done: Set<string>): void {
    writeFileSync(STATE_FILE, JSON.stringify([...done], null, 4));
}

/**
 * Sends the categories for a single bot.
 *
 * @param token - That bot's own API token.
 * @param categories - The categories to advertise.
 * @returns The HTTP status and, on failure, the response body.
 */
async function patchCategories(
    token: string,
    categories: string[],
): Promise<{ status: number; body: string }> {
    const res = await fetch(`${API}/profiles/me`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
            Authorization: `Bot ${token}`,
        },
        body: JSON.stringify({ categories }),
    });

    if (res.status === 204) return { status: 204, body: "" };

    const body = await res.text().catch(() => "");
    return { status: res.status, body: body.slice(0, 200) };
}

async function main(): Promise<void> {
    const mapping = readJson<CategoryMap>(MAPPING_FILE);
    const tokens = readJson<Record<string, string>>(TOKENS_FILE);
    const done = loadState();

    const entries = Object.entries(mapping);
    const missingToken = entries
        .filter(([username]) => !tokens[username])
        .map(([username]) => username);

    if (missingToken.length > 0) {
        throw new Error(
            `No token found for: ${missingToken.join(", ")}. ` +
                `Run 'pnpm migrate-bots' first.`,
        );
    }

    console.log(
        `${DRY_RUN ? "[dry run] " : ""}${entries.length} bots -> ${API}` +
            (done.size > 0 ? ` (${done.size} already done, skipping)` : ""),
    );

    let ok = 0;
    let skipped = 0;
    const failures: { username: string; status: number; body: string }[] = [];

    for (const [username, categories] of entries) {
        if (done.has(username)) {
            skipped++;
            continue;
        }

        if (DRY_RUN) {
            console.log(`  ${username.padEnd(22)} ${categories.join(", ")}`);
            ok++;
            continue;
        }

        const { status, body } = await patchCategories(
            tokens[username],
            categories,
        );

        if (status === 204) {
            ok++;
            done.add(username);
            saveState(done);
            console.log(
                `  ok   ${username.padEnd(22)} ${categories.join(", ")}`,
            );
        } else {
            failures.push({ username, status, body });
            console.error(
                `  FAIL ${username.padEnd(22)} HTTP ${status} ${body}`,
            );
        }

        await wait(DELAY_MS);
    }

    console.log(
        `\ndone: ${ok} patched, ${skipped} skipped, ${failures.length} failed`,
    );

    if (failures.length > 0) {
        console.error(
            "\nRe-run to retry only the failures — successes are recorded in " +
                STATE_FILE,
        );
        process.exitCode = 1;
    }
}

void main();
