import { Notification } from "@core/domain/entities/notification.entity";
import { NotificationType } from "@core/domain/enums/notification-type.enum";
import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import type { NotifyMentionedUsersInput } from "./notify-mentioned-users.input";

/**
 * Use case for notifying the users named with an @handle in a body.
 *
 * Shared by posts, comments and articles so the three suppression rules the
 * feature promises - never yourself, never twice for the same handle, never
 * alongside a notification the same action already sent - are decided in one
 * place rather than re-derived at each call site.
 */
export class NotifyMentionedUsersUseCase {
    /**
     * Creates a new instance of NotifyMentionedUsersUseCase.
     *
     * @param notificationRepository - Repository for persisting notifications
     * @param realtimeService - Service for pushing the notifications live
     */
    constructor(
        private readonly notificationRepository: INotificationRepository,
        private readonly realtimeService: RealtimePort,
    ) {}

    /**
     * Fans a mention out to everyone it names.
     *
     * @param input - Who was mentioned, by whom, and what to link to
     * @returns Promise<number> The number of users notified
     *
     * @remarks
     * Writes through createMany rather than one create per recipient: create
     * trims the recipient's history to its most recent rows and costs three
     * queries every time, which is the wrong shape for a fan-out.
     */
    async execute(input: NotifyMentionedUsersInput): Promise<number> {
        const excluded = new Set(input.excludeUserIds ?? []);
        excluded.add(input.issuerId);

        const recipientIds = [...new Set(input.mentionedUserIds)].filter(
            (id) => !excluded.has(id),
        );

        if (recipientIds.length === 0) return 0;

        await this.notificationRepository.createMany(
            recipientIds.map((recipientId) =>
                Notification.create(
                    recipientId,
                    input.issuerId,
                    NotificationType.MENTION,
                    input.target,
                ),
            ),
        );

        const referenceId =
            input.target.commentId ??
            input.target.articleId ??
            input.target.postId;

        for (const recipientId of recipientIds) {
            this.realtimeService.emitToUser(recipientId, "new-notification", {
                type: NotificationType.MENTION,
                issuerId: input.issuerId,
                postId: input.target.postId,
                articleId: input.target.articleId,
                articleSlug: input.articleSlug,
                commentId: input.target.commentId,
                referenceId,
            });
        }

        return recipientIds.length;
    }
}
