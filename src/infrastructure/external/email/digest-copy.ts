import { NotificationType } from "@core/domain/enums/notification-type.enum";
import type { SupportedLanguage } from "@core/domain/constants/language.constants";

/**
 * Everything the digest email says, in each language the platform supports.
 *
 * Written out per language rather than run through a translation layer: there
 * are two languages and one email, and a table anybody can read and correct
 * beats indirection nobody can proofread.
 */
export interface DigestCopy {
    /** The `<title>` and the subject line. */
    subject: string;

    /** The small label in the black header bar. */
    heading: string;

    /** Opening line. */
    greeting: string;

    /** Sentence under the greeting. */
    intro: string;

    /** Heading of the "you missed this" section. */
    notificationsTitle: string;

    /** Heading of the "from your topics" section. */
    postsTitle: string;

    /** The link at the end of each section. */
    seeAll: string;

    /** Sentence in the footer, above the unsubscribe link. */
    footer: string;

    /** The unsubscribe link's own text. */
    unsubscribe: string;

    /**
     * How each notification type reads, with the issuer's handle already in
     * front of it: "@ada" + " " + this.
     */
    notification: Record<NotificationType, string>;
}

/**
 * The copy table, keyed by language.
 */
export const DIGEST_COPY: Record<SupportedLanguage, DigestCopy> = {
    tr: {
        subject: "Bugün neleri kaçırdın",
        heading: "Günlük Özet",
        greeting: "Merhaba,",
        intro: "Dün seni ilgilendiren neler olduğunu topladık.",
        notificationsTitle: "Kaçırdığın bildirimler",
        postsTitle: "İlgi alanlarından",
        seeAll: "Hepsini gör",
        footer: "Bu maili günlük özete abone olduğun için alıyorsun.",
        unsubscribe: "Abonelikten çık",
        notification: {
            [NotificationType.FOLLOW]: "seni takip etmeye başladı.",
            [NotificationType.NEW_POST]: "yeni bir gönderi paylaştı.",
            [NotificationType.LIKE]: "gönderini beğendi.",
            [NotificationType.COMMENT]: "gönderine yorum yaptı.",
            [NotificationType.COMMENT_LIKE]: "yorumunu beğendi.",
            [NotificationType.COMMENT_REPLY]: "yorumuna yanıt verdi.",
            [NotificationType.QUOTE]: "gönderini alıntıladı.",
            [NotificationType.MEDIA_REJECTED]:
                "Yüklediğin bir medya moderasyon tarafından kaldırıldı.",
            [NotificationType.MENTION]: "senden bahsetti.",
        },
    },
    en: {
        subject: "What you missed today",
        heading: "Daily Digest",
        greeting: "Hello,",
        intro: "Here is what happened while you were away.",
        notificationsTitle: "Notifications you missed",
        postsTitle: "From your topics",
        seeAll: "See everything",
        footer: "You are receiving this because you subscribed to the daily digest.",
        unsubscribe: "Unsubscribe",
        notification: {
            [NotificationType.FOLLOW]: "started following you.",
            [NotificationType.NEW_POST]: "published a new post.",
            [NotificationType.LIKE]: "liked your post.",
            [NotificationType.COMMENT]: "commented on your post.",
            [NotificationType.COMMENT_LIKE]: "liked your comment.",
            [NotificationType.COMMENT_REPLY]: "replied to your comment.",
            [NotificationType.QUOTE]: "quoted your post.",
            [NotificationType.MEDIA_REJECTED]:
                "One of your uploads was removed by moderation.",
            [NotificationType.MENTION]: "mentioned you.",
        },
    },
};

/**
 * Reads the copy for a language.
 *
 * @param language - The recipient's language.
 * @returns That language's copy table.
 */
export function digestCopyFor(language: SupportedLanguage): DigestCopy {
    return DIGEST_COPY[language];
}
