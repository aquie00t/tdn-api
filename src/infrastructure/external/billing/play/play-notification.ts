import { SubscriptionStatus } from "@core/domain/enums";

/**
 * What Google says happened to a subscription.
 *
 * The numbers are Google's, and they are the whole reason this table exists:
 * a notification arrives as `notificationType: 13` and nothing else.
 *
 * Note that none of them are trusted as *state*. Every one of them means the
 * same thing to us - "ask Google what is true now" - because notifications
 * arrive out of order and can be redelivered, while a fetch answers with the
 * present. The names are kept for the audit trail and the log line.
 */
export const PLAY_NOTIFICATION_TYPES: Record<number, string> = {
    1: "SUBSCRIPTION_RECOVERED",
    2: "SUBSCRIPTION_RENEWED",
    3: "SUBSCRIPTION_CANCELED",
    4: "SUBSCRIPTION_PURCHASED",
    5: "SUBSCRIPTION_ON_HOLD",
    6: "SUBSCRIPTION_IN_GRACE_PERIOD",
    7: "SUBSCRIPTION_RESTARTED",
    8: "SUBSCRIPTION_PRICE_CHANGE_CONFIRMED",
    9: "SUBSCRIPTION_DEFERRED",
    10: "SUBSCRIPTION_PAUSED",
    11: "SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED",
    12: "SUBSCRIPTION_REVOKED",
    13: "SUBSCRIPTION_EXPIRED",
    20: "SUBSCRIPTION_PENDING_PURCHASE_CANCELED",
};

/**
 * Google's own name for where a subscription stands.
 *
 * Returned by the Play Developer API, not by the notification.
 */
export type PlaySubscriptionState =
    | "SUBSCRIPTION_STATE_PENDING"
    | "SUBSCRIPTION_STATE_ACTIVE"
    | "SUBSCRIPTION_STATE_PAUSED"
    | "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"
    | "SUBSCRIPTION_STATE_ON_HOLD"
    | "SUBSCRIPTION_STATE_CANCELED"
    | "SUBSCRIPTION_STATE_EXPIRED";

/**
 * One subscription notification, once the envelope is off.
 */
export interface PlaySubscriptionNotification {
    /** Google's identifier for this delivery, used to spot a redelivery. */
    messageId: string;

    /** The purchase this concerns. Our `providerSubscriptionId`. */
    purchaseToken: string;

    /** The subscription product. */
    subscriptionId: string;

    /** Google's numeric type. */
    notificationType: number;

    /** That type as a name, for the audit trail. */
    typeName: string;

    /** When Google says the event happened. */
    eventAt: Date;
}

/**
 * What arrived, once the envelope is off.
 *
 * A test notification is a real thing Google sends when somebody presses "Send
 * test notification" in the console, and it names no subscription. Recognised
 * rather than treated as malformed, because it is the first thing anybody does
 * when wiring this up and answering it with a 400 makes it look broken.
 */
export type ParsedPlayNotification =
    | { kind: "subscription"; notification: PlaySubscriptionNotification }
    | { kind: "test"; messageId: string }
    | { kind: "ignored"; messageId: string; reason: string };

/**
 * Turns Google's subscription state into ours.
 *
 * `PAUSED` maps to `CANCELED` deliberately: a paused subscription is not being
 * paid for, and the badge is a thing you have while paying. It comes back on
 * its own when Google reports the subscription active again.
 *
 * `ON_HOLD` maps to `CANCELED` for the same reason - Google has already
 * stopped the entitlement by then - while `IN_GRACE_PERIOD` maps to
 * `IN_GRACE`, which keeps the badge: the user paid for the period they are in
 * and Google is still retrying the next payment.
 *
 * @param state - Google's state, whatever it sent
 * @returns The status to store
 */
export function mapPlayState(state: string): SubscriptionStatus {
    switch (state) {
        case "SUBSCRIPTION_STATE_ACTIVE":
            return SubscriptionStatus.ACTIVE;
        case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
            return SubscriptionStatus.IN_GRACE;
        case "SUBSCRIPTION_STATE_PENDING":
            return SubscriptionStatus.PENDING;
        case "SUBSCRIPTION_STATE_PAUSED":
        case "SUBSCRIPTION_STATE_ON_HOLD":
        case "SUBSCRIPTION_STATE_CANCELED":
        case "SUBSCRIPTION_STATE_EXPIRED":
            return SubscriptionStatus.CANCELED;
        default:
            // An unknown state is not an active one. Google adds values over
            // time, and the safe reading of "I do not recognise this" is that
            // the badge is not granted rather than that it is.
            return SubscriptionStatus.CANCELED;
    }
}

/**
 * The shape Pub/Sub pushes: the notification, base64, inside an envelope.
 */
interface PubSubPushBody {
    message?: {
        data?: string;
        messageId?: string;
        message_id?: string;
        publishTime?: string;
    };
}

interface DeveloperNotification {
    version?: string;
    packageName?: string;
    eventTimeMillis?: string;
    subscriptionNotification?: {
        notificationType?: number;
        purchaseToken?: string;
        subscriptionId?: string;
    };
    testNotification?: { version?: string };
    voidedPurchaseNotification?: { purchaseToken?: string };
    oneTimeProductNotification?: unknown;
}

/**
 * Unwraps a Pub/Sub push into the notification inside it.
 *
 * Total rather than throwing: this runs on an endpoint Google calls, and every
 * outcome other than "understood and acted on" has to be reported as something
 * Google will not retry forever. A malformed body is `ignored`, not an error.
 *
 * @param body - The raw request body
 * @returns What arrived, and enough to act on it
 */
export function parsePlayNotification(body: unknown): ParsedPlayNotification {
    const envelope = body as PubSubPushBody | undefined;
    const message = envelope?.message;
    const messageId = message?.messageId ?? message?.message_id ?? "";

    if (!message?.data) {
        return { kind: "ignored", messageId, reason: "no message data" };
    }

    let decoded: DeveloperNotification;

    try {
        decoded = JSON.parse(
            Buffer.from(message.data, "base64").toString("utf8"),
        ) as DeveloperNotification;
    } catch {
        return { kind: "ignored", messageId, reason: "undecodable payload" };
    }

    if (decoded.testNotification) {
        return { kind: "test", messageId };
    }

    const subscription = decoded.subscriptionNotification;

    if (!subscription?.purchaseToken || !subscription.notificationType) {
        return {
            kind: "ignored",
            messageId,
            reason: decoded.voidedPurchaseNotification
                ? "voided purchase, handled by the next fetch"
                : "not a subscription notification",
        };
    }

    const eventMillis = Number(decoded.eventTimeMillis);

    return {
        kind: "subscription",
        notification: {
            // Falling back to the purchase token keeps the dedupe key
            // meaningful even if Pub/Sub ever omits the id: a redelivery of
            // the same event then still collides.
            messageId:
                messageId ||
                `${subscription.purchaseToken}:${decoded.eventTimeMillis ?? ""}`,
            purchaseToken: subscription.purchaseToken,
            subscriptionId: subscription.subscriptionId ?? "",
            notificationType: subscription.notificationType,
            typeName:
                PLAY_NOTIFICATION_TYPES[subscription.notificationType] ??
                `UNKNOWN_${subscription.notificationType}`,
            eventAt: Number.isFinite(eventMillis)
                ? new Date(eventMillis)
                : new Date(),
        },
    };
}
