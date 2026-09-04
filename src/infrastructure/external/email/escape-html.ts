/**
 * Characters that change the meaning of an HTML document, and their entities.
 */
const ENTITIES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};

/**
 * Escapes a value before it is interpolated into an email body.
 *
 * The transactional emails have never needed this - the only value they
 * interpolate is an eight-digit code - but the digest prints handles, post
 * excerpts and tag names, all of which are written by users. Without escaping,
 * a post body is markup in everybody else's inbox.
 *
 * @param value - Untrusted text.
 * @returns The text, safe to place in element content or a quoted attribute.
 */
export function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}
