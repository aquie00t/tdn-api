/**
 * Names of the realtime events a conversation produces.
 *
 * Namespaced with a colon so they cannot collide with the notification
 * channel's `new-notification`, which shares one Redis channel and one socket
 * with them.
 */
export const ChatEvents = {
    /** A message arrived in an accepted conversation. */
    MESSAGE_NEW: "message:new",

    /** The other participant opened the thread. */
    MESSAGE_READ: "message:read",

    /** The sender withdrew a message. */
    MESSAGE_DELETED: "message:deleted",

    /**
     * A video attached to one of the recipient's own messages was refused.
     * Sent to the sender, not the recipient: the message stays, its media
     * does not.
     */
    MESSAGE_MEDIA_REJECTED: "message:media_rejected",

    /**
     * Somebody the recipient does not follow opened a conversation. Kept
     * distinct from {@link ChatEvents.MESSAGE_NEW} so a client can put it in
     * the requests tab without lighting up the unread badge.
     */
    CONVERSATION_REQUEST: "conversation:request",
} as const;

/**
 * One of the realtime event names a conversation produces.
 */
export type ChatEvent = (typeof ChatEvents)[keyof typeof ChatEvents];
