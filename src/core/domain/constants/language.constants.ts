/**
 * The languages the feed can tell apart and rank on.
 *
 * Deliberately short. Every code here needs a detector that can recognise it
 * from a post's text, and a wrong guess is worse than no guess: a Turkish post
 * labelled `en` is pushed out of exactly the feed it belongs in. Adding a
 * language means teaching {@link isSupportedLanguage}'s detector about it
 * first, not just widening this list.
 */
export const SUPPORTED_LANGUAGES = ["tr", "en"] as const;

/**
 * A language code the feed understands.
 */
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * The language a viewer is assumed to want when nothing else is known.
 *
 * TDN is a Turkish developer network, so an anonymous visitor with no usable
 * `Accept-Language` gets the Turkish feed rather than an arbitrary one.
 */
export const DEFAULT_LANGUAGE: SupportedLanguage = "tr";

/**
 * Narrows an arbitrary string to a language the feed supports.
 *
 * @param value - The candidate code, in any casing.
 * @returns True when the value is one of {@link SUPPORTED_LANGUAGES}.
 */
export function isSupportedLanguage(value: string): value is SupportedLanguage {
    return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Normalises a language tag onto a supported code.
 *
 * Accepts the region-tagged forms that reach us from `Accept-Language` and
 * from clients (`tr-TR`, `en_GB`, `EN`), because only the primary subtag
 * matters for ranking - a post is not more relevant to `en-GB` than to
 * `en-US`.
 *
 * @param tag - The raw language tag.
 * @returns The supported code, or null when the tag names something else.
 */
export function normalizeLanguageTag(tag: string): SupportedLanguage | null {
    const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
    return isSupportedLanguage(primary) ? primary : null;
}

/**
 * Reads an HTTP `Accept-Language` header into supported language codes.
 *
 * Honours the quality values browsers send (`tr-TR,tr;q=0.9,en;q=0.8`) and
 * drops everything the feed does not support, keeping the caller's order of
 * preference. Parsing lives here rather than in the HTTP layer so that every
 * rule about language tags - which ones exist, how a region tag is folded
 * away, what beats what - stays in one place.
 *
 * @param header - The raw header value, if the request carried one.
 * @returns The supported codes, most preferred first, without duplicates.
 */
export function parseLanguagePreferenceHeader(
    header: string | undefined,
): SupportedLanguage[] {
    if (!header) return [];

    const ranked = header
        .split(",")
        .map((part) => {
            const [tag, ...params] = part.split(";");
            const quality = params
                .map((param) => /^\s*q=([\d.]+)\s*$/.exec(param))
                .find((match) => match !== null);

            return {
                tag: tag.trim(),
                // A tag with no q is q=1, which is what makes the unweighted
                // "tr,en" behave the same as the fully weighted form.
                quality: quality ? Number.parseFloat(quality[1]) : 1,
            };
        })
        .filter(({ quality }) => Number.isFinite(quality) && quality > 0)
        .sort((a, b) => b.quality - a.quality);

    const seen = new Set<SupportedLanguage>();
    for (const { tag } of ranked) {
        const code = normalizeLanguageTag(tag);
        if (code) seen.add(code);
    }

    return [...seen];
}
