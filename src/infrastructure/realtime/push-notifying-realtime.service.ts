import type { NotificationType } from "@core/domain/enums";
import type {
    RealtimeEventPayload,
    RealtimeNotificationPayload,
    RealtimePort,
} from "@core/ports/services/realtime.port";
import type { SendPushNotificationUseCase } from "@core/use-cases/notification/send-push";

/**
 * The event every user-facing notification is emitted under.
 *
 * Chat travels the same channel under its own names, and must not be pushed
 * from here: a message's text is encrypted at rest, and putting a preview in a
 * push payload would route it through Google's servers and undo that.
 */
const NOTIFICATION_EVENT = "new-notification";

/**
 * Adds push delivery to the realtime channel.
 *
 * A decorator rather than an edit to a dozen use cases. Every notification in
 * this codebase follows the same two lines - store the row, emit
 * `new-notification` - so wrapping the emit is the one seam that catches all
 * of them, including the ones written after this. The alternative was touching
 * every call site and relying on whoever adds the thirteenth to remember.
 *
 * The socket is still the primary transport and is never held up: the push is
 * dispatched fire-and-forget behind it, because a socket write is immediate
 * and a push involves an HTTP round trip to a third party.
 */
export class PushNotifyingRealtimeService implements RealtimePort {
    /**
     * Creates a new instance of PushNotifyingRealtimeService.
     *
     * @param realtimeTransport - The socket service being wrapped
     * @param sendPushNotificationUseCase - The second transport
     */
    constructor(
        private readonly realtimeTransport: RealtimePort,
        private readonly sendPushNotificationUseCase: SendPushNotificationUseCase,
    ) {}

    /**
     * Emits an event to a user, and pushes it if it is a notification.
     *
     * @param userId - The recipient
     * @param event - The event name
     * @param payload - The event payload
     */
    emitToUser(
        userId: string,
        event: string,
        payload: RealtimeEventPayload,
    ): void {
        this.realtimeTransport.emitToUser(userId, event, payload);

        if (event !== NOTIFICATION_EVENT) return;

        const notification = payload as RealtimeNotificationPayload;

        // A notification always names who caused it and what kind it is.
        // Anything reaching this event without them is not one, whatever the
        // union says at compile time.
        if (!notification.issuerId || !notification.type) return;

        // The use case swallows its own failures, so this catch should never
        // fire. It is here because the alternative if it ever did - a rejected
        // promise nobody is holding - is an unhandled rejection, and this path
        // runs behind a socket write on every notification in the system.
        void this.sendPushNotificationUseCase
            .execute({
                recipientId: userId,
                issuerId: notification.issuerId,
                type: notification.type as NotificationType,
                postId: notification.postId,
                commentId: notification.commentId,
                articleId: notification.articleId,
                articleSlug: notification.articleSlug,
            })
            .catch(() => undefined);
    }
}
