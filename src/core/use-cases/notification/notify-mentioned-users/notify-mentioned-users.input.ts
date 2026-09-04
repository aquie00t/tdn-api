import type { NotificationTarget } from "@core/domain/entities/notification.entity";

/**
 * Input for the NotifyMentionedUsersUseCase.
 */
export interface NotifyMentionedUsersInput {
    /** The account that wrote the mention, and the issuer of every notification. */
    issuerId: string;

    /** Ids of the users named in the content, already resolved to real accounts. */
    mentionedUserIds: string[];

    /** What the notification should deep-link to. */
    target: NotificationTarget;

    /** Slug of the article, when the target is one; used by the realtime payload. */
    articleSlug?: string;

    /**
     * Recipients that already receive a notification for this same event and
     * must not also receive a MENTION - the post author being answered, the
     * comment author being replied to, the quoted author.
     */
    excludeUserIds?: string[];
}
