import type { NotificationType } from "@core/domain/enums";
import type { IDeviceTokenRepository } from "@core/ports/repositories/device-token.repository";
import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { PushMessage, PushPort } from "@core/ports/services/push.port";
import { pushCopyFor } from "./push-copy";

/**
 * A notification that has just been stored, as much of it as a push needs.
 */
export interface SendPushNotificationInput {
    recipientId: string;

    issuerId: string;

    type: NotificationType;

    /** Ids the app needs to open the right screen. */
    postId?: string;
    commentId?: string;
    articleId?: string;
    articleSlug?: string;
}

/**
 * Use case for putting a notification on a user's phones.
 *
 * The second transport, beside the socket. A socket only exists while the app
 * is in the foreground - both mobile platforms close it the moment the app is
 * backgrounded - so without this, a notification reaches a phone only if
 * somebody happens to be looking at it.
 *
 * Nothing here is load-bearing. The notification is already stored and already
 * on the socket by the time this runs; a failure costs a buzz, so every path
 * out of here is quiet.
 */
export class SendPushNotificationUseCase {
    /**
     * Creates a new instance of SendPushNotificationUseCase.
     *
     * @param deviceTokenRepository - The recipient's registered devices
     * @param userRepository - Used to name the issuer in the copy
     * @param notificationRepository - Used for the badge count
     * @param pushService - The wire
     * @param logger - Records a failure nobody is waiting on
     */
    constructor(
        private readonly deviceTokenRepository: IDeviceTokenRepository,
        private readonly userRepository: IUserRepository,
        private readonly notificationRepository: INotificationRepository,
        private readonly pushService: PushPort,
        private readonly logger: LoggerPort,
    ) {}

    /**
     * Sends one notification to every device the recipient has registered.
     *
     * @param input - The notification that was just stored
     *
     * @remarks
     * Dead tokens are deleted as they are reported. A token for an app that
     * was uninstalled never becomes valid again, and left in the table it
     * would be retried on every notification for the rest of the account's
     * life - a cost that grows with exactly the users who left.
     */
    async execute(input: SendPushNotificationInput): Promise<void> {
        try {
            const devices = await this.deviceTokenRepository.findByUserId(
                input.recipientId,
            );

            if (devices.length === 0) return;

            const issuer = await this.userRepository.findById(input.issuerId);

            // Without a handle there is nothing worth saying: "somebody did
            // something" is the kind of notification people turn off.
            if (!issuer) return;

            const badge = await this.notificationRepository.getUnreadCount(
                input.recipientId,
            );

            const data = this.deepLinkData(input);

            const messages: PushMessage[] = devices.map((device) => ({
                to: device.token,
                ...pushCopyFor(input.type, issuer.username, device.locale),
                data,
                badge,
            }));

            const { invalidTokens } = await this.pushService.send(messages);

            if (invalidTokens.length > 0) {
                await this.deviceTokenRepository.deleteByTokens(invalidTokens);
            }
        } catch (error: unknown) {
            this.logger.error(
                { err: error, recipientId: input.recipientId },
                "Failed to deliver a push notification",
            );
        }
    }

    /**
     * The ids the app opens the right screen with.
     *
     * Ids and a type only. This payload leaves our infrastructure and passes
     * through Google's on its way to the phone, so nothing anybody wrote goes
     * in it - which is also why a direct message is not notified from here at
     * all: its text is encrypted at rest and putting a preview in a push would
     * quietly undo that.
     *
     * @param input - The notification being delivered
     * @returns The payload, with absent ids omitted
     */
    private deepLinkData(
        input: SendPushNotificationInput,
    ): Record<string, string> {
        const data: Record<string, string> = { type: input.type };

        if (input.postId) data.postId = input.postId;
        if (input.commentId) data.commentId = input.commentId;
        if (input.articleId) data.articleId = input.articleId;
        if (input.articleSlug) data.articleSlug = input.articleSlug;

        return data;
    }
}
