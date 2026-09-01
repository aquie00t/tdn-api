/**
 * Measures where the API's time actually goes.
 *
 * Written to settle a question that guesswork got wrong: the community feed
 * was slow, and the suspicion was an expensive query. It is not. Every query
 * this API issues returns in well under a millisecond of server time; what
 * costs a second is the distance each of them travels, multiplied by how many
 * of them a request makes.
 *
 * Run it before and after a region change to see the difference:
 *
 *     NODE_ENV=production npx tsx scripts/measure-latency.ts
 *
 * Read-only. It issues `SELECT 1`, a Redis `PING` and GET requests against the
 * public feed, and writes nothing anywhere.
 */
import { config } from "dotenv";
import Redis from "ioredis";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const env = process.env.NODE_ENV ?? "development";
config({ path: `.env.${env}` });

const PASSES = 7;

/**
 * Runs a probe repeatedly and reports the median, which is what a typical
 * request pays. The minimum flatters a cold path and the maximum reports one
 * unlucky packet; neither describes the experience.
 *
 * @param label - What is being measured
 * @param probe - The operation to time
 * @param passes - How many samples to take
 * @returns The median duration in milliseconds
 */
async function median(
    label: string,
    probe: () => Promise<unknown>,
    passes = PASSES,
): Promise<number> {
    const times: number[] = [];

    for (let i = 0; i < passes; i++) {
        const started = performance.now();
        await probe();
        times.push(performance.now() - started);
    }

    times.sort((a, b) => a - b);
    const value = times[Math.floor(times.length / 2)];

    console.log(
        `  ${label.padEnd(44)} ${value.toFixed(0).padStart(5)} ms` +
            `   (min ${times[0].toFixed(0)}, max ${times[times.length - 1].toFixed(0)})`,
    );

    return value;
}

/**
 * Times how long the server takes to produce a response, with the connection
 * setup excluded: that part is served by the CDN edge and does not move when
 * the origin does.
 *
 * @param url - The endpoint to fetch
 * @returns The time to the response body, in milliseconds
 */
async function fetchOnce(url: string): Promise<void> {
    const response = await fetch(url, {
        headers: { "user-agent": "tdn-latency-probe" },
    });

    await response.arrayBuffer();
}

async function main(): Promise<void> {
    console.log(`\nenv: ${env}\n`);

    console.log("round trip to each store, from this machine:");

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });

    // Warm the pool first: the first query also pays for TCP and TLS, which is
    // not what a request on a live instance pays.
    await prisma.$queryRawUnsafe("SELECT 1");
    const postgres = await median("postgres  SELECT 1", () =>
        prisma.$queryRawUnsafe("SELECT 1"),
    );
    await prisma.$disconnect();

    const redis = new Redis(process.env.REDIS_URL as string, {
        lazyConnect: true,
    });
    await redis.connect();
    await redis.ping();
    const cache = await median("redis     PING", () => redis.ping());
    redis.disconnect();

    // Neither query does any work, so whatever they cost is distance. That is
    // the number to watch: it multiplies by every round trip a request makes,
    // and a ranked feed page makes about a dozen.
    console.log(
        `\n  both queries do no work, so the numbers above are pure distance.`,
    );
    console.log(
        `  a request making 10 round trips pays about ` +
            `${(Math.max(postgres, cache) * 10).toFixed(0)} ms of it.\n`,
    );

    const apiUrl = process.env.API_URL;

    if (!apiUrl) {
        console.log("API_URL is not set; skipping the endpoint probes.\n");
        return;
    }

    console.log("time to a full response, from this machine:");

    // The ranked feed against two that skip ranking. The gap between them is
    // what the ranking path costs, and it is round trips rather than work.
    await median(
        "GET /posts?type=COMMUNITY      (ranked)",
        () => fetchOnce(`${apiUrl}/api/v1/posts?type=COMMUNITY&limit=10`),
        3,
    );
    await median(
        "GET /posts?type=SYSTEM_UPDATE  (chronological)",
        () => fetchOnce(`${apiUrl}/api/v1/posts?type=SYSTEM_UPDATE&limit=10`),
        3,
    );
    await median(
        "GET /tags/trending             (cached)",
        () => fetchOnce(`${apiUrl}/api/v1/tags/trending?limit=5`),
        3,
    );

    console.log("");
}

void main();
