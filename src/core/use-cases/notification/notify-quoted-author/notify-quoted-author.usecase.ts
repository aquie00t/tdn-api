import { Notification } from "@core/domain/entities/notification.entity";
import { NotificationType } from "@core/domain/enums/notification-type.enum";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import type { NotifyQuotedAuthorInput } from "./notify-quoted-author.input";

/**
 * Use case for telling an author that one of their posts was quoted.
 *
 * Kept separate from post creation for the same reason as
 * {@link NotifyNewPostUseCase}: a single caller-agnostic entry point, so
 * moving it onto a queue later is a change of caller rather than a rewrite.
 */
export class NotifyQuotedAuthorUseCase {
    /**
     * Creates a new instance of NotifyQuotedAuthorUseCase.
     *
     * @param postRepository - Repository used to resolve the quoted post's author
     * @param notificationRepository - Repository for persisting the notification
     * @param realtimeService - Service for pushing the notification live
     */
    constructor(
        private readonly postRepository: IPostRepository,
        private readonly notificationRepository: INotificationRepository,
        private readonly realtimeService: RealtimePort,
    ) {}

    /**
     * Notifies the author of the quoted post.
     *
     * @param input - The new quote, the post it quotes, and who published it
     * @returns Promise<number> The number of people notified: 1, or 0
     *
     * @remarks
     * The notification points at the **quote**, not at the post being quoted:
     * the recipient already knows their own post, what they want to open is
     * what somebody said about it, and the quote carries the original as its
     * card anyway. That also buys the cleanup for free - `Notification.post`
     * cascades, so deleting the quote takes its notification with it.
     *
     * Returns 0 without writing anything when the quoted post is already gone
     * (a narrow race between the commit and this call) or when an account
     * quotes itself, which is not news to anyone.
     */
    async execute(input: NotifyQuotedAuthorInput): Promise<number> {
        const quotedPost = await this.postRepository.findById(
            input.quotedPostId,
        );
        if (!quotedPost) return 0;

        const recipientId = quotedPost.author.id;
        if (recipientId === input.issuerId) return 0;

        await this.notificationRepository.create(
            Notification.create(
                recipientId,
                input.issuerId,
                NotificationType.QUOTE,
                { postId: input.quotePostId },
            ),
        );

        this.realtimeService.emitToUser(recipientId, "new-notification", {
            type: NotificationType.QUOTE,
            issuerId: input.issuerId,
            postId: input.quotePostId,
            referenceId: input.quotePostId,
        });

        return 1;
    }
}
