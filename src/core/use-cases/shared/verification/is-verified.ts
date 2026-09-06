/**
 * Whether a stored badge expiry still grants the badge.
 *
 * The one place the denormalised column is interpreted. Every read that shows
 * a person asks this rather than comparing dates itself, so the tick appears
 * and disappears at the same moment everywhere - and so that a column holding
 * an expiry can never be mistaken for a boolean that is simply set.
 *
 * @param verifiedUntil - The stored expiry, if any
 * @param now - Reference time
 * @returns True while the badge is still granted
 */
export function isVerified(
    verifiedUntil: Date | null | undefined,
    now: Date = new Date(),
): boolean {
    return verifiedUntil !== null && verifiedUntil !== undefined
        ? verifiedUntil.getTime() > now.getTime()
        : false;
}
