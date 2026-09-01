/**
 * Strips the CDN prefix off a media URL, leaving the storage key.
 *
 * Post and comment media travel as absolute CDN URLs, because that is the
 * contract the upload endpoint has always returned and clients store them.
 * Every check the platform makes is keyed on the storage key instead, so the
 * two representations have to be convertible at the boundary.
 *
 * A value that is already a bare key is returned unchanged, which is what lets
 * the same helper serve callers that never saw a URL.
 *
 * @param value - An absolute CDN URL or a bare storage key
 * @param cdnBaseUrl - The CDN origin media is served from
 * @returns The storage key, or null when the value points somewhere else
 */
export function toStorageKey(value: string, cdnBaseUrl: string): string | null {
    const trimmed = value.trim();

    if (trimmed.length === 0) return null;

    if (!/^https?:\/\//i.test(trimmed)) {
        // Already a key. Reject traversal outright rather than normalising it:
        // no legitimate key the platform generates contains a "..".
        return trimmed.includes("..") ? null : trimmed.replace(/^\/+/, "");
    }

    const base = cdnBaseUrl.replace(/\/+$/, "");

    if (!trimmed.startsWith(base + "/")) return null;

    // Query strings are used as cache busters on avatars and carry no meaning
    // for the key itself.
    const key = trimmed.slice(base.length + 1).split(/[?#]/)[0];

    if (key.length === 0 || key.includes("..")) return null;

    return key;
}

/**
 * Builds the absolute CDN URL for a storage key.
 *
 * @param storageKey - The stored object key
 * @param cdnBaseUrl - The CDN origin media is served from
 * @returns The URL clients can fetch the object from
 */
export function toMediaUrl(storageKey: string, cdnBaseUrl: string): string {
    return `${cdnBaseUrl.replace(/\/+$/, "")}/${storageKey}`;
}
