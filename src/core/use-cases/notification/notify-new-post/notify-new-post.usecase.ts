import { Notification } from "@core/domain/entities/notification.entity";
import { NotificationType } from "@core/domain/enums/notification-type.enum";
import { PostType } from "@core/domain/enums/post-type.enum";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import type { NotifyNewPostInput } from "./notify-new-post.input";

/**
 * Post types whose publication notifies the author's followers.
 *
 * Only the bot-authored types qualify. Community posts are deliberately
 * silent: the persona accounts that keep the feed from looking empty publish
 * them too, and notifying every follower of every one of those would bury the
 * bot releases people actually followed an account for.
 */
const NOTIFYING_POST_TYPES: readonly PostType[] = [
    PostType.TECH_NEWS,
    PostType.SYSTEM_UPDATE,
];

/**
 * Use case for notifying an account's followers that it published a post.
 *
 * Kept separate from post creation so it has a single caller-agnostic entry
 * point: today it runs inline after the post commits, and moving it onto a
 * queue later is a change of caller, not a rewrite.
 */
export class NotifyNewPostUseCase {
    /**
     * Creates a new instance of NotifyNewPostUseCase.
     *
     * @param followUserRepository - Repository used to resolve the follower list
     * @param notificationRepository - Repository for persisting notifications
     * @param realtimeService - Service for pushing the notification live
     */
    constructor(
        private readonly followUserRepository: IFollowRepository,
        private readonly notificationRepository: INotificationRepository,
        private readonly realtimeService: RealtimePort,
    ) {}

    /**
     * Fans the new post out to every follower of its author.
     *
     * @param input - The post, its author, and its type
     * @returns Promise<number> The number of followers notified
     *
     * @remarks
     * Returns early without touching the database when the post type does not
     * notify, or when the author has no followers. The author is filtered out
     * of the recipient list defensively - an account cannot normally follow
     * itself, but a self-notification would be visible nonsense if it ever did.
     *
     * `excludeUserIds` is how one post stays one notification per person. The
     * three fan-outs a post can raise rank QUOTE > MENTION > NEW_POST, and the
     * more specific signal wins: being named tells you something this
     * broadcast does not. The caller knows both the mentioned users and the
     * quoted author before either fan-out starts, so nothing here has to wait
     * on the other.
     */
    async execute(input: NotifyNewPostInput): Promise<number> {
        if (!NOTIFYING_POST_TYPES.includes(input.postType)) return 0;

        const followerIds = await this.followUserRepository.getFollowerIds(
            input.authorId,
        );

        const excluded = new Set(input.excludeUserIds ?? []);
        excluded.add(input.authorId);

        const recipientIds = followerIds.filter((id) => !excluded.has(id));
        if (recipientIds.length === 0) return 0;

        await this.notificationRepository.createMany(
            recipientIds.map((recipientId) =>
                Notification.create(
                    recipientId,
                    input.authorId,
                    NotificationType.NEW_POST,
                    { postId: input.postId },
                ),
            ),
        );

        for (const recipientId of recipientIds) {
            this.realtimeService.emitToUser(recipientId, "new-notification", {
                type: NotificationType.NEW_POST,
                issuerId: input.authorId,
                postId: input.postId,
                referenceId: input.postId,
            });
        }

        return recipientIds.length;
    }
}
