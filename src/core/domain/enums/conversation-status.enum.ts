/**
 * Where a direct conversation sits between "somebody wrote to you" and
 * "you are talking".
 *
 * Mirrors the `ConversationStatus` enum in the Prisma schema exactly, so
 * domain values can be cast onto Prisma values without a translation layer.
 */
export enum ConversationStatus {
    /**
     * Opened by an account the recipient does not follow. It lives in a
     * requests tab, only the initiator may write to it, and it raises no
     * realtime notification - which is what keeps an open inbox from being a
     * spam channel.
     */
    PENDING = "PENDING",

    /**
     * Both sides may write. A conversation opened by somebody the recipient
     * already follows starts here, because following is already the statement
     * that they want to hear from that account.
     */
    ACCEPTED = "ACCEPTED",

    /**
     * The recipient turned the request down. The initiator can no longer
     * write, and the conversation stops appearing for the recipient. Kept
     * rather than deleted so the same account cannot simply open a fresh
     * request the moment it is refused.
     */
    DECLINED = "DECLINED",
}
