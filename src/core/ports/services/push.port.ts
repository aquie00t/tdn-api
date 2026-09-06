/**
 * One notification, addressed to one installation.
 */
export interface PushMessage {
    /** The Expo push token of the device to reach. */
    to: string;

    /** Short line shown in bold on the lock screen. */
    title: string;

    /** The body beneath it. */
    body: string;

    /**
     * What the app needs to open the right screen when it is tapped.
     *
     * Ids and a type, never content: this payload leaves our infrastructure
     * and passes through Google's on the way to the phone.
     */
    data: Record<string, string>;

    /** Unread count to show on the app icon, when the platform supports it. */
    badge?: number;
}

/**
 * What a send attempt achieved.
 */
export interface PushSendResult {
    /** How many messages the service accepted. */
    delivered: number;

    /**
     * Tokens the service says no longer exist.
     *
     * Reported rather than logged because they have to be deleted: a token for
     * an app that was uninstalled is dead for good, and left in the table it
     * would be retried on every notification for the rest of the account's
     * life.
     */
    invalidTokens: string[];
}

/**
 * Port interface for delivering push notifications.
 *
 * Deliberately narrow: it takes messages that are already written and already
 * addressed. Deciding *what* to say, in which language, and to which of a
 * user's devices belongs to the use case that composes them - this is the wire.
 */
export interface PushPort {
    /**
     * Sends notifications to the devices they are addressed to.
     *
     * Must not throw for a delivery failure. A push is a courtesy on top of a
     * notification that is already stored and already on the socket, and the
     * caller is usually a fire-and-forget path with nothing useful to do about
     * a provider being down.
     *
     * @param messages - The notifications to deliver.
     * @returns How many were accepted, and which tokens are dead.
     */
    send(messages: PushMessage[]): Promise<PushSendResult>;
}
