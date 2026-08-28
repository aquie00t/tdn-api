import { PostCategory } from "@core/domain/enums/post-category-enum";

/**
 * The outcome of normalizing a raw `categories` query parameter.
 */
export interface NormalizedCategoryQuery {
    /** The tokens that resolved to a known category, in the order supplied. */
    categories: PostCategory[];

    /** The tokens that matched no known category, as the caller wrote them. */
    invalid: string[];
}

/**
 * Normalizes the raw `categories` query parameter into known categories and
 * leftovers.
 *
 * Fastify hands the value over in several shapes depending on how the client
 * wrote the query string - a single value, a repeated-key array, a comma
 * separated string, or a mix - and they all normalize identically here so the
 * same intent never depends on the spelling of the request. Matching is
 * case-insensitive.
 *
 * Callers decide what an unknown token means: the post feed drops it and falls
 * back to an unfiltered query, while bot discovery rejects the request.
 *
 * @param raw - The raw category value from the query string.
 * @returns The recognized categories alongside any unrecognized tokens.
 */
export function normalizeCategoryQuery(
    raw?: string | string[],
): NormalizedCategoryQuery {
    if (!raw) return { categories: [], invalid: [] };

    // Split on commas even for the array form: Fastify's AJV runs with
    // coerceTypes "array", so a comma separated string arrives here already
    // wrapped as a single-element array, and only splitting the scalar form
    // would leave "AI,GAME" as one unrecognizable token.
    const tokens = (Array.isArray(raw) ? raw : [raw])
        .flatMap((value) => value.split(","))
        .map((token) => token.trim())
        .filter((token) => token.length > 0);

    const known = new Set<string>(Object.values(PostCategory));
    const categories: PostCategory[] = [];
    const invalid: string[] = [];

    for (const token of tokens) {
        const normalized = token.toUpperCase();

        if (known.has(normalized)) {
            categories.push(normalized as PostCategory);
        } else {
            invalid.push(token);
        }
    }

    return { categories, invalid };
}
