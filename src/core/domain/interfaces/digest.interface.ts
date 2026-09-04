import type { NotificationType } from "@core/domain/enums/notification-type.enum";
import type { SupportedLanguage } from "@core/domain/constants/language.constants";

/**
 * A user the daily digest may write to.
 *
 * Deliberately narrow: the audience sweep visits every eligible account once a
 * morning, and a full `User` per row would drag the whole table through memory
 * for three fields.
 */
export interface DigestRecipient {
    /** Unique identifier of the recipient */
    id: string;

    /** Verified address the digest is sent to */
    email: string;

    /** Feed languages the user chose, most preferred first; may be empty */
    languages: string[];
}

/**
 * One page of the audience sweep.
 */
export interface DigestRecipientPage {
    recipients: DigestRecipient[];

    /** Id to resume after, or null when the sweep is finished */
    nextCursor: string | null;
}

/**
 * One line in the "you missed this" section.
 *
 * Already resolved for rendering: the issuer's handle rather than an id, and
 * the deep link rather than the ids it was built from.
 */
export interface DigestNotificationItem {
    type: NotificationType;

    /** Handle of whoever caused the notification */
    issuerUsername: string;

    /** Where the notification points, absolute and ready to click */
    url: string;

    createdAt: Date;
}

/**
 * One card in the "from your topics" section.
 */
export interface DigestPostItem {
    /** Handle of the post's author */
    authorUsername: string;

    /** Short plain-text lead, already trimmed to a sentence or two */
    excerpt: string;

    /** Absolute link to the post */
    url: string;
}

/**
 * Everything one recipient's email needs, with nothing left to look up.
 *
 * The use case assembles these; rendering them to HTML is the adapter's job,
 * exactly as it is for the transactional emails.
 */
export interface DailyDigestEmail {
    to: string;

    /** Language the copy is written in */
    language: SupportedLanguage;

    /** Absolute one-click unsubscribe link, also sent as a List-Unsubscribe header */
    unsubscribeUrl: string;

    notifications: DigestNotificationItem[];

    posts: DigestPostItem[];
}

/**
 * What happened to a batch of digests at the provider.
 *
 * Unlike the transactional email path, which swallows every failure, a digest
 * run has to be able to say how many of several thousand emails were actually
 * accepted.
 */
export interface DigestSendResult {
    /** How many the provider accepted */
    sent: number;

    /** The ones it refused, with the reason it gave */
    failed: { to: string; reason: string }[];
}
