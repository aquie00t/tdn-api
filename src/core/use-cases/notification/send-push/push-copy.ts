import { NotificationType } from "@core/domain/enums";

/** The languages push copy is written in. */
type PushLanguage = "tr" | "en";

/** One notification, as a title and a body. */
export interface PushCopy {
    title: string;
    body: string;
}

/**
 * What each kind of notification says, per language.
 *
 * The handle is interpolated rather than baked in so the same table serves
 * both languages, and the body is a whole sentence rather than a fragment: a
 * lock screen shows it with no context around it.
 *
 * Nothing here quotes what anybody wrote. A push payload travels through
 * Google's servers to reach the phone, and the one thing this platform
 * promises not to hand over that way is content.
 */
const PUSH_COPY: Record<
    PushLanguage,
    Record<NotificationType, (handle: string) => PushCopy>
> = {
    tr: {
        [NotificationType.FOLLOW]: (handle) => ({
            title: "Yeni takipçi",
            body: `@${handle} seni takip etmeye başladı.`,
        }),
        [NotificationType.NEW_POST]: (handle) => ({
            title: "Yeni gönderi",
            body: `@${handle} yeni bir gönderi paylaştı.`,
        }),
        [NotificationType.COMMENT]: (handle) => ({
            title: "Yeni yorum",
            body: `@${handle} gönderine yorum yaptı.`,
        }),
        [NotificationType.LIKE]: (handle) => ({
            title: "Yeni beğeni",
            body: `@${handle} gönderini beğendi.`,
        }),
        [NotificationType.COMMENT_LIKE]: (handle) => ({
            title: "Yeni beğeni",
            body: `@${handle} yorumunu beğendi.`,
        }),
        [NotificationType.COMMENT_REPLY]: (handle) => ({
            title: "Yeni yanıt",
            body: `@${handle} yorumuna yanıt verdi.`,
        }),
        [NotificationType.QUOTE]: (handle) => ({
            title: "Alıntı",
            body: `@${handle} gönderini alıntıladı.`,
        }),
        [NotificationType.MENTION]: (handle) => ({
            title: "Senden bahsedildi",
            body: `@${handle} bir gönderide senden bahsetti.`,
        }),
        [NotificationType.MEDIA_REJECTED]: () => ({
            title: "Medya reddedildi",
            body: "Yüklediğin bir dosya kurallara takıldı.",
        }),
    },
    en: {
        [NotificationType.FOLLOW]: (handle) => ({
            title: "New follower",
            body: `@${handle} started following you.`,
        }),
        [NotificationType.NEW_POST]: (handle) => ({
            title: "New post",
            body: `@${handle} shared a new post.`,
        }),
        [NotificationType.COMMENT]: (handle) => ({
            title: "New comment",
            body: `@${handle} commented on your post.`,
        }),
        [NotificationType.LIKE]: (handle) => ({
            title: "New like",
            body: `@${handle} liked your post.`,
        }),
        [NotificationType.COMMENT_LIKE]: (handle) => ({
            title: "New like",
            body: `@${handle} liked your comment.`,
        }),
        [NotificationType.COMMENT_REPLY]: (handle) => ({
            title: "New reply",
            body: `@${handle} replied to your comment.`,
        }),
        [NotificationType.QUOTE]: (handle) => ({
            title: "Quoted",
            body: `@${handle} quoted your post.`,
        }),
        [NotificationType.MENTION]: (handle) => ({
            title: "You were mentioned",
            body: `@${handle} mentioned you in a post.`,
        }),
        [NotificationType.MEDIA_REJECTED]: () => ({
            title: "Media rejected",
            body: "A file you uploaded did not pass moderation.",
        }),
    },
};

/**
 * Picks the language a device should be written to in.
 *
 * The device's own locale, not the profile's feed languages: a notification is
 * read on a lock screen that is already in one language, and the two settings
 * answer different questions. Anything that is not Turkish falls to English,
 * which is what the rest of the platform does.
 *
 * @param locale - The BCP-47 tag the app registered, if any
 * @returns The language to write in
 */
function languageFor(locale: string | null): PushLanguage {
    return locale?.toLowerCase().startsWith("tr") ? "tr" : "en";
}

/**
 * Writes one notification for one device.
 *
 * @param type - What happened
 * @param handle - Who caused it, without the leading "@"
 * @param locale - The device's locale
 * @returns The title and body to show
 */
export function pushCopyFor(
    type: NotificationType,
    handle: string,
    locale: string | null,
): PushCopy {
    return PUSH_COPY[languageFor(locale)][type](handle);
}
