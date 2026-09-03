/**
 * A keyset cursor over a timestamp-ordered list.
 *
 * Paging on a timestamp alone loses rows: two conversations can gain their
 * newest message in the same millisecond, and two messages can be written in
 * one - ordinary in a live thread. A `WHERE ts < cursor` predicate then skips
 * every row sharing the boundary timestamp, and no `ORDER BY` tiebreaker can
 * fix that, because ordering only decides how a page is sorted, never which
 * rows it contains. Carrying the row's id alongside the timestamp makes the
 * key unique, so the predicate can resume exactly where the last page stopped.
 */

/**
 * A decoded cursor: the sort key of the last row already served.
 */
export interface KeysetCursor {
    /** The ordering timestamp of that row. */
    timestamp: Date;

    /** Its id, which breaks ties on that timestamp. */
    id: string;
}

/**
 * The shape a cursor is serialised as.
 *
 * Single letters because the encoded form travels in a query string on every
 * page request, and the field names are pure overhead there.
 */
interface EncodedCursor {
    t: string;
    i: string;
}

/**
 * Longest cursor we will even attempt to decode.
 *
 * A cursor is roughly 80 characters; anything far larger is not one, and
 * refusing it early keeps a hostile query string from being base64-decoded and
 * JSON-parsed at all.
 */
const MAX_CURSOR_LENGTH = 512;

/**
 * Serialises a cursor into an opaque, URL-safe string.
 *
 * Base64url rather than a readable `timestamp:id` pair, so that the format
 * stays ours to change: a client that can read a cursor will eventually
 * construct one, and then the encoding is API.
 *
 * @param cursor - The sort key to resume after
 * @returns The opaque cursor string
 */
export function encodeKeysetCursor(cursor: KeysetCursor): string {
    const payload: EncodedCursor = {
        t: cursor.timestamp.toISOString(),
        i: cursor.id,
    };

    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * Reads a cursor string back, rejecting anything malformed.
 *
 * Returns null rather than throwing, for every way a cursor can be wrong -
 * truncated by a client, hand-written, or left over from an older encoding.
 * A bad cursor is not an error worth failing a request over: the caller falls
 * back to serving the first page, which is what a reader holding a broken
 * cursor actually wants to see.
 *
 * @param raw - The cursor string from the request
 * @returns The decoded cursor, or null when it is not a usable one
 */
export function decodeKeysetCursor(raw: string): KeysetCursor | null {
    if (raw.length === 0 || raw.length > MAX_CURSOR_LENGTH) return null;

    let parsed: unknown;
    try {
        const json = Buffer.from(raw, "base64url").toString("utf8");
        parsed = JSON.parse(json);
    } catch {
        return null;
    }

    if (typeof parsed !== "object" || parsed === null) return null;

    const { t, i } = parsed as Partial<EncodedCursor>;

    if (typeof t !== "string" || typeof i !== "string" || i.length === 0) {
        return null;
    }

    const timestamp = new Date(t);

    // An unparseable date would become an Invalid Date, and comparing against
    // one silently matches nothing - a page that is empty for no stated reason.
    if (Number.isNaN(timestamp.getTime())) return null;

    return { timestamp, id: i };
}
