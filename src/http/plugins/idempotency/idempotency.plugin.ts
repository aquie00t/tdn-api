import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fastifyPlugin from "fastify-plugin";
import { ConflictError } from "@core/errors";
import type { CachePort } from "@core/ports/services/cache.port";
import {
    fingerprintBody,
    idempotencyCacheKey,
    isReplayable,
    type IdempotencyRecord,
} from "./idempotency-record";

const HEADER = "idempotency-key";

const REPLAY_HEADER = "idempotent-replay";

/** Longest key a client may send; anything longer is a mistake or an attack. */
const MAX_KEY_LENGTH = 200;

/** How long a claim and its answer are remembered. */
const RECORD_TTL_SECONDS = 24 * 60 * 60;

/**
 * Largest response body kept for replay.
 *
 * A cap rather than a promise: past it the claim still prevents the second
 * execution, and the retry gets a conflict instead of the original answer.
 * Nothing this feature protects returns anything near it.
 */
const MAX_STORED_BODY_BYTES = 64 * 1024;

/** Where a won claim is kept between the two hooks. */
const CLAIM = Symbol("idempotencyClaim");

interface Claim {
    cacheKey: string;
    fingerprint: string;
}

type RequestWithClaim = FastifyRequest & { [CLAIM]?: Claim };

/**
 * Answers a retry from the record its first attempt left behind.
 *
 * @param cacheService - Where records live
 * @param reply - The reply to send
 * @param cacheKey - Where this request's record lives
 * @param fingerprint - The retry's own body fingerprint
 *
 * @throws ConflictError - When the key was used with a different body, or the
 * first attempt has not finished
 */
async function replayRecord(
    cacheService: CachePort,
    reply: FastifyReply,
    cacheKey: string,
    fingerprint: string,
): Promise<void> {
    const raw = await cacheService.get(cacheKey);

    // The claim was lost but the record has already gone - a TTL that expired
    // between the two calls. Letting the request through is the only useful
    // answer left, and by then a duplicate is a day old.
    if (!raw) return;

    const record = JSON.parse(raw) as IdempotencyRecord;

    if (record.fingerprint !== fingerprint) {
        throw new ConflictError(
            "This Idempotency-Key was already used with a different request.",
        );
    }

    if (record.state === "in-flight" || record.body === undefined) {
        reply.header("retry-after", "1");

        throw new ConflictError(
            "A request with this Idempotency-Key is still in progress.",
        );
    }

    reply
        .header(REPLAY_HEADER, "true")
        .type("application/json")
        .status(record.statusCode ?? 200)
        .send(record.body);
}

/**
 * Makes a retried write safe to send twice.
 *
 * Mobile networks make "did that send?" a routine question: a client that
 * loses the *response* to a request cannot know whether the request itself
 * landed, and retrying is the only thing it can do. Without this, that retry
 * is a second post, a second comment, a second uploaded file.
 *
 * Opt-in per route (`config: { idempotency: true }`) rather than global. Most
 * writes here are already idempotent - a like, a follow, a device
 * registration - and wrapping those would cost a round trip to buy nothing.
 *
 * A request with no `Idempotency-Key` behaves exactly as it did before, which
 * is what leaves the web client untouched.
 *
 * @param fastify - The Fastify application instance
 */
function idempotencyPlugin(fastify: FastifyInstance): void {
    const cacheService = fastify.diContainer.cradle.cacheService;

    fastify.addHook("preHandler", async (request, reply) => {
        if (request.routeOptions.config?.idempotency !== true) return;

        const key = request.headers[HEADER];
        const userId = request.user?.id;

        // Unauthenticated callers are out of scope: there is nothing to scope
        // a client-chosen key by, and every route that opts in requires a
        // session anyway.
        if (typeof key !== "string" || key.length === 0 || !userId) return;

        if (key.length > MAX_KEY_LENGTH) {
            throw new ConflictError("Idempotency-Key is too long.");
        }

        const cacheKey = idempotencyCacheKey(
            userId,
            request.method,
            request.routeOptions.url ?? request.url,
            key,
        );
        const fingerprint = fingerprintBody(request.body);

        let won: boolean;

        try {
            won = await cacheService.setIfAbsent(
                cacheKey,
                JSON.stringify({
                    state: "in-flight",
                    fingerprint,
                } satisfies IdempotencyRecord),
                RECORD_TTL_SECONDS,
            );
        } catch (error: unknown) {
            // Fail open, deliberately. This is a safety net over a write that
            // already works; making it a hard dependency would turn a cache
            // blip into "nobody can post anything".
            fastify.log.error(
                { err: error, cacheKey },
                "Idempotency claim failed; proceeding without it",
            );
            return;
        }

        if (won) {
            (request as RequestWithClaim)[CLAIM] = { cacheKey, fingerprint };
            return;
        }

        await replayRecord(cacheService, reply, cacheKey, fingerprint);
    });

    fastify.addHook("onSend", async (request, reply, payload) => {
        const claim = (request as RequestWithClaim)[CLAIM];

        if (!claim) return payload;

        try {
            if (!isReplayable(reply.statusCode)) {
                // A failure must not be remembered: a transient 500 would
                // otherwise block this key for a day.
                await cacheService.delete(claim.cacheKey);

                return payload;
            }

            const body = typeof payload === "string" ? payload : undefined;
            const storable =
                body !== undefined &&
                Buffer.byteLength(body) <= MAX_STORED_BODY_BYTES;

            await cacheService.set(
                claim.cacheKey,
                JSON.stringify({
                    state: "completed",
                    fingerprint: claim.fingerprint,
                    statusCode: reply.statusCode,
                    body: storable ? body : undefined,
                } satisfies IdempotencyRecord),
                RECORD_TTL_SECONDS,
            );
        } catch (error: unknown) {
            // The write already happened and the client is about to be told
            // so. Losing the record costs a retry its replay, not its result.
            fastify.log.error(
                { err: error, cacheKey: claim.cacheKey },
                "Failed to record an idempotent response",
            );
        }

        return payload;
    });
}

export default fastifyPlugin(idempotencyPlugin, {
    name: "idempotency-plugin",
    dependencies: ["di-plugin"],
});
