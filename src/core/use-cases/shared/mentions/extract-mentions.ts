import { MentionLimitExceededError } from "@core/errors";

/** Most distinct handles a single body may name. */
export const MAX_MENTIONS = 10;

/** Shortest username the register schema accepts. */
const MIN_HANDLE_LENGTH = 3;

/** Longest username the register schema accepts. */
const MAX_HANDLE_LENGTH = 30;

/**
 * Matches an @handle written in a body.
 *
 * The character class mirrors the username rule enforced at registration
 * (`^[a-zA-Z0-9._]+$`), and the lookbehind is what keeps this from firing on
 * things that merely contain an at-sign: an email address (`ada@example.com`),
 * a path (`docs/@v2`), or a doubled marker (`@@here`). Length is checked after
 * the match rather than in the pattern, because a trailing dot has to be
 * trimmed as punctuation first.
 */
const MENTION_PATTERN = /(?<![A-Za-z0-9._/@])@([A-Za-z0-9._]+)/g;

/**
 * Reads the distinct @handles out of a body.
 *
 * The limit is deliberately applied here, to what the author wrote, rather
 * than to whatever survives the user lookup: it costs no query, and the answer
 * cannot change because an account was renamed or deleted between two
 * otherwise identical requests.
 *
 * Handles are deduplicated case-insensitively but returned in the casing and
 * order they first appear, which is what the resolver hands to the database.
 *
 * @param content - The raw post, comment or article body
 * @returns The distinct handles, without their leading "@"
 * @throws MentionLimitExceededError - When more than MAX_MENTIONS are named
 */
export function extractMentionHandles(content: string): string[] {
    const handles: string[] = [];
    const seen = new Set<string>();

    for (const match of content.matchAll(MENTION_PATTERN)) {
        // A handle may legally contain dots, so only trailing ones are
        // ambiguous: "@ada." at the end of a sentence is the handle "ada".
        const handle = match[1].replace(/[._]+$/, "");

        if (
            handle.length < MIN_HANDLE_LENGTH ||
            handle.length > MAX_HANDLE_LENGTH
        ) {
            continue;
        }

        const key = handle.toLowerCase();
        if (seen.has(key)) continue;

        seen.add(key);
        handles.push(handle);
    }

    if (handles.length > MAX_MENTIONS) {
        throw new MentionLimitExceededError(
            `At most ${MAX_MENTIONS} mentions are allowed per post.`,
        );
    }

    return handles;
}
