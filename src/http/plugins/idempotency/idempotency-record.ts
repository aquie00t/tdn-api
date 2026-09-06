import { createHash } from "node:crypto";

/**
 * Where a claimed request got to.
 *
 * `in-flight` is a real state rather than an absence: a retry that arrives
 * while the first attempt is still running must be told to wait, not served a
 * second execution.
 */
export type IdempotencyState = "in-flight" | "completed";

/**
 * What is remembered about one claimed request.
 */
export interface IdempotencyRecord {
    state: IdempotencyState;

    /**
     * Fingerprint of the request body.
     *
     * Kept so the same key arriving with a different body is refused rather
     * than answered with the first request's result - which would be a client
     * bug quietly turned into a wrong response.
     */
    fingerprint: string;

    /** Status of the stored response, once there is one. */
    statusCode?: number;

    /** The serialised response body, once there is one. */
    body?: string;
}

/**
 * The cache key one claim lives under.
 *
 * Scoped by account as well as by route: a key is a value the client invents,
 * so two people can easily pick the same one, and a shared bucket would let
 * one of them be handed the other's response.
 *
 * The version prefix means a change to what is stored can be rolled out by
 * bumping it rather than by reasoning about records written by the previous
 * deploy.
 *
 * @param userId - The account making the request
 * @param method - HTTP method
 * @param routePath - The route pattern, not the resolved URL
 * @param key - The client's `Idempotency-Key`
 * @returns The cache key
 */
export function idempotencyCacheKey(
    userId: string,
    method: string,
    routePath: string,
    key: string,
): string {
    return `idem:v1:${userId}:${method}:${routePath}:${key}`;
}

/**
 * Fingerprints a request body.
 *
 * A multipart upload has no body to fingerprint - it is a stream that has not
 * been read yet - and returns a constant. The key alone guards those, which is
 * weaker and is documented as such.
 *
 * @param body - The parsed request body, if any
 * @returns A stable hash of the body
 */
export function fingerprintBody(body: unknown): string {
    if (body === undefined || body === null) return "empty";
    if (typeof body !== "object")
        return createHash("sha256").update(String(body)).digest("hex");
    if (Buffer.isBuffer(body)) return "stream";

    try {
        return createHash("sha256").update(stableStringify(body)).digest("hex");
    } catch {
        // A body that will not serialise cannot be compared; the key alone
        // guards it, exactly as for an upload.
        return "unhashable";
    }
}

/**
 * Serialises a value with object keys in a fixed order, at every depth.
 *
 * `JSON.stringify(value, keys)` looks like it would do this and does something
 * else entirely: the second argument is a *filter*, applied at every level, so
 * any nested key absent from the top-level list disappears. Two bodies
 * differing only somewhere nested would then fingerprint the same - and a
 * fingerprint collision here does not merely miss a duplicate, it replays the
 * wrong response to a genuinely different request.
 *
 * @param value - The value to serialise
 * @returns A stable string for the value
 */
function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value) ?? "null";
    }

    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    }

    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(
            ([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`,
        );

    return `{${entries.join(",")}}`;
}

/**
 * Whether a response is worth remembering.
 *
 * Only success is stored. A 4xx is deterministic - the retry will be told the
 * same thing by the handler itself - and a 5xx must stay retryable, because
 * remembering a transient failure would block the request for as long as the
 * record lives.
 *
 * @param statusCode - The status the handler produced
 * @returns True when the response should be replayed to a retry
 */
export function isReplayable(statusCode: number): boolean {
    return statusCode >= 200 && statusCode < 300;
}
