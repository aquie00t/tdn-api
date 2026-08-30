import { BadRequestError } from "@core/errors";

/** Maximum number of tags an article may carry. */
const MAX_TAGS = 5;

/** Shape a tag must have once normalized. */
const TAG_PATTERN = /^[a-z0-9-]{1,30}$/;

/** Shape of the file name part of a cover image key. */
const COVER_FILE_PATTERN = /^[0-9a-f-]{36}[.](jpg|jpeg|png|webp|gif|avif)$/;

/**
 * Normalizes an article title.
 *
 * @param title - The raw title from the request
 * @returns The trimmed, NFC-normalized title
 * @throws BadRequestError - When the title is blank
 */
export function normalizeTitle(title: string): string {
    const normalized = title.normalize("NFC").trim();

    if (normalized.length === 0) {
        throw new BadRequestError("Title cannot be empty.");
    }

    // Rejected in code rather than with a schema pattern: ajv compiles patterns
    // without the unicode flag, so a control-character class there is easy to
    // get subtly wrong.
    for (let i = 0; i < normalized.length; i++) {
        const code = normalized.charCodeAt(i);
        if (code < 32 || code === 127) {
            throw new BadRequestError(
                "Title cannot contain control characters.",
            );
        }
    }

    return normalized;
}

/**
 * Normalizes an article body.
 *
 * The markdown is kept exactly as written apart from Unicode normalization and
 * trimming; the API never renders it, so there is nothing to escape here.
 * A NUL byte is rejected because Postgres cannot store it in a text column.
 *
 * @param body - The raw markdown from the request
 * @returns The trimmed, NFC-normalized markdown
 * @throws BadRequestError - When the body is blank or contains a NUL byte
 */
export function normalizeBody(body: string): string {
    if (body.includes(String.fromCharCode(0))) {
        throw new BadRequestError("Body cannot contain null bytes.");
    }

    const normalized = body.normalize("NFC").trim();

    if (normalized.length === 0) {
        throw new BadRequestError("Body cannot be empty.");
    }

    return normalized;
}

/**
 * Normalizes and validates a tag list.
 *
 * Tags are supplied explicitly rather than extracted from the body, so they are
 * lowercased, de-duplicated and checked against a strict shape before they can
 * reach connectOrCreate and create rows in the shared tag vocabulary.
 *
 * @param tags - The raw tags from the request
 * @returns Unique, normalized tag names
 * @throws BadRequestError - When a tag is malformed or there are too many
 */
export function normalizeTags(tags?: string[]): string[] {
    if (!tags || tags.length === 0) return [];

    const normalized: string[] = [];

    for (const raw of tags) {
        const tag = raw.trim().toLowerCase();
        if (tag.length === 0) continue;

        if (!TAG_PATTERN.test(tag)) {
            throw new BadRequestError(
                "Tags may only contain lowercase letters, digits and hyphens, up to 30 characters.",
            );
        }

        if (!normalized.includes(tag)) normalized.push(tag);
    }

    if (normalized.length > MAX_TAGS) {
        throw new BadRequestError(
            "An article may carry at most " + MAX_TAGS + " tags.",
        );
    }

    return normalized;
}

/**
 * Validates a cover image storage key.
 *
 * The article body accepts a storage key rather than a URL, and the key must
 * live under the requesting user's own prefix. That single rule keeps
 * javascript: and data: URLs out of stored content, blocks external tracking
 * pixels, and stops one user from attaching another user's upload.
 *
 * @param key - The key from the request, if any
 * @param userId - The authenticated user the key must belong to
 * @returns The validated key, or null when none was supplied
 * @throws BadRequestError - When the key is not one this user could have uploaded
 */
export function validateCoverImageKey(
    key: string | null | undefined,
    userId: string,
): string | null {
    if (key === null || key === undefined || key.length === 0) return null;

    const prefix = "articles/covers/" + userId + "/";

    if (!key.startsWith(prefix)) {
        throw new BadRequestError("Cover image key is not valid.");
    }

    const fileName = key.slice(prefix.length);

    if (!COVER_FILE_PATTERN.test(fileName)) {
        throw new BadRequestError("Cover image key is not valid.");
    }

    return key;
}

/**
 * Normalizes a tag used as a *read* filter.
 *
 * Tags are stored lowercased by {@link normalizeTags}, so a filter that is not
 * lowercased matches nothing. Unlike the write path this never throws: a
 * malformed filter is a filter that matches no article, not a bad request, and
 * a blank one is no filter at all.
 *
 * @param tag - The raw tag from the query string
 * @returns The lowercased tag, or undefined when nothing was supplied
 */
export function normalizeTagFilter(tag?: string): string | undefined {
    if (!tag) return undefined;

    const normalized = tag.trim().toLowerCase();

    return normalized.length > 0 ? normalized : undefined;
}
