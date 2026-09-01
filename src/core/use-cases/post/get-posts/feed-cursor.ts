/**
 * The feed cursor.
 *
 * A cursor pins a reader to one ranked order and records how far into it they
 * have scrolled. Page numbers cannot do that: the ranked order is rebuilt
 * whenever a post is published, and a reader on page 3 of the old order lands
 * somewhere arbitrary in the new one - seeing posts twice, and missing others
 * outright. On a network with 144 news bots publishing, that is the normal
 * case rather than a rare race.
 */

/**
 * A decoded cursor.
 */
export interface FeedCursor {
    /** Identifies the snapshot of the ranked order this reader is walking. */
    token: string;

    /** How many posts of that order have already been served. */
    offset: number;
}

/**
 * The shape a cursor is serialised as.
 *
 * Single letters because the encoded form travels in a query string on every
 * page request, and the field names are pure overhead there.
 */
interface EncodedCursor {
    t: string;
    o: number;
}

/**
 * Longest cursor we will even attempt to decode.
 *
 * A cursor is roughly 60 characters; anything far larger is not one, and
 * refusing it early keeps a hostile query string from being base64-decoded and
 * JSON-parsed at all.
 */
const MAX_CURSOR_LENGTH = 512;

/**
 * Serialises a cursor into an opaque, URL-safe string.
 *
 * Base64url rather than a readable `token:offset` pair, so that the format
 * stays ours to change: a client that can read a cursor will eventually
 * construct one, and then the encoding is API.
 *
 * @param cursor - The cursor to encode.
 * @returns The opaque cursor string.
 */
export function encodeFeedCursor(cursor: FeedCursor): string {
    const payload: EncodedCursor = { t: cursor.token, o: cursor.offset };

    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * Reads a cursor string back, rejecting anything malformed.
 *
 * Returns null rather than throwing, for every way a cursor can be wrong -
 * truncated by a client, hand-written, or left over from an older encoding.
 * A bad cursor is not an error worth failing a feed request over: the caller
 * falls back to serving the first page, which is what a reader with a broken
 * cursor actually wants to see.
 *
 * @param raw - The cursor string from the request.
 * @returns The decoded cursor, or null when it is not a usable one.
 */
export function decodeFeedCursor(raw: string): FeedCursor | null {
    if (raw.length === 0 || raw.length > MAX_CURSOR_LENGTH) return null;

    let parsed: unknown;
    try {
        const json = Buffer.from(raw, "base64url").toString("utf8");
        parsed = JSON.parse(json);
    } catch {
        return null;
    }

    if (typeof parsed !== "object" || parsed === null) return null;

    const { t, o } = parsed as Partial<EncodedCursor>;

    if (typeof t !== "string" || t.length === 0) return null;
    // A non-integer or negative offset would slice the ranked order from a
    // nonsensical position; there is no sane reading of it to recover.
    if (typeof o !== "number" || !Number.isSafeInteger(o) || o < 0) return null;

    return { token: t, offset: o };
}
