import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Domain separator mixed into the key.
 *
 * The signing secret is shared with session tokens, and a signature is only
 * trustworthy if it cannot be replayed into a different question. Prefixing
 * the message with what it is for means an unsubscribe signature can never be
 * mistaken for - or forged from - anything else signed with the same key.
 */
const TOKEN_PURPOSE = "digest-unsubscribe";

/**
 * Signs a user id for the unsubscribe link.
 *
 * Deliberately not a JWT: those expire, and an unsubscribe link has to work
 * whenever somebody finally scrolls back to that email. There is nothing to
 * store either - the signature is recomputed and compared on the way back in.
 *
 * @param userId - The account the link belongs to.
 * @param secret - The signing key.
 * @returns The hex signature to put in the link.
 */
export function signUnsubscribeToken(userId: string, secret: string): string {
    return createHmac("sha256", secret)
        .update(`${TOKEN_PURPOSE}:${userId}`)
        .digest("hex");
}

/**
 * Checks a signature handed back by an unsubscribe link.
 *
 * Compared in constant time: a leaking comparison would let someone recover a
 * valid signature a byte at a time and unsubscribe other people.
 *
 * @param userId - The account the link claims to be for.
 * @param token - The signature from the link.
 * @param secret - The signing key.
 * @returns True when the signature is this user's.
 */
export function verifyUnsubscribeToken(
    userId: string,
    token: string,
    secret: string,
): boolean {
    const expected = Buffer.from(signUnsubscribeToken(userId, secret), "utf8");
    const provided = Buffer.from(token, "utf8");

    // timingSafeEqual throws on a length mismatch, which is itself a length
    // oracle only for the hex encoding - a wrong-length token is never valid.
    if (expected.length !== provided.length) return false;

    return timingSafeEqual(expected, provided);
}
