import { BadRequestError } from "@core/errors";

/** Schemes a link on a profile may use. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** Longest platform name accepted as a key. */
const MAX_KEY_LENGTH = 20;

/** Longest link accepted. */
const MAX_VALUE_LENGTH = 300;

/** Most links one profile may carry. */
const MAX_LINKS = 10;

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * Checks the links a profile carries before they are stored.
 *
 * `format: "uri"` in the schema is not this check. RFC 3986 asks for *a*
 * scheme and nothing more, so `javascript:`, `data:` and `vbscript:` all
 * satisfy it - and this is the one field on the platform explicitly typed as a
 * URL, which is exactly the field a client will render as an `href` without
 * thinking. A profile is public, so anything stored here is served to anyone
 * who asks.
 *
 * The keys are constrained too: they are platform names, and an unbounded
 * record of arbitrary strings is a place for somebody to keep whatever they
 * like at everyone else's expense.
 *
 * @param socials - The links submitted, if any
 *
 * @throws BadRequestError - When a key, a link or the count is unacceptable
 */
export function assertSafeSocialLinks(
    socials: Record<string, string> | null | undefined,
): void {
    if (!socials) return;

    const entries = Object.entries(socials);

    if (entries.length > MAX_LINKS) {
        throw new BadRequestError(
            `A profile may carry at most ${MAX_LINKS} links.`,
        );
    }

    for (const [key, value] of entries) {
        if (key.length > MAX_KEY_LENGTH || !KEY_PATTERN.test(key)) {
            throw new BadRequestError(`"${key}" is not a valid link name.`);
        }

        if (value.length > MAX_VALUE_LENGTH) {
            throw new BadRequestError(`The link for "${key}" is too long.`);
        }

        let protocol: string;

        try {
            protocol = new URL(value).protocol;
        } catch {
            throw new BadRequestError(`The link for "${key}" is not a URL.`);
        }

        if (!ALLOWED_PROTOCOLS.has(protocol)) {
            throw new BadRequestError(
                `Links must be http or https; "${key}" is not.`,
            );
        }
    }
}
