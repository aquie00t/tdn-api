import { MediaNotOwnedError } from "@core/errors";
import { MediaModerationStatus, type MediaChannel } from "@core/domain/enums";
import type { IMediaAssetRepository } from "@core/ports/repositories/media-asset.repository";
import { toStorageKey } from "./media-url";

/**
 * What the caller needs to know about the media it is about to store.
 */
export interface ResolvedMedia {
    /** The storage keys behind the submitted URLs, in submission order. */
    storageKeys: string[];

    /** True when any attached asset was judged borderline. */
    isSensitive: boolean;

    /**
     * The moderation state the content itself should carry: PENDING while any
     * attached video is still unscanned, APPROVED otherwise.
     */
    mediaStatus: MediaModerationStatus;
}

/**
 * Resolves submitted media URLs into assets this author is allowed to use.
 *
 * This is the check that makes moderation mean anything. Scanning at upload
 * time only governs what the upload endpoint writes to storage; nothing stops
 * a client from skipping that endpoint and putting its own URLs straight into
 * a post body. Requiring every URL to resolve to an asset row this uploader
 * created, and that moderation did not reject, closes that path.
 *
 * All three failure modes - unknown key, someone else's key, already rejected
 * - raise the same error on purpose. Distinguishing them would turn the
 * endpoint into an oracle for which keys exist.
 *
 * @param params - The submitted URLs, who is attaching them, and where to look
 * @returns The resolved keys and the moderation state to store alongside them
 *
 * @throws MediaNotOwnedError - When any URL does not resolve to a usable asset
 */
export async function resolveAttachableMedia(params: {
    mediaUrls: string[];
    uploaderId: string;
    channel: MediaChannel;
    cdnBaseUrl: string;
    mediaAssetRepository: IMediaAssetRepository;
}): Promise<ResolvedMedia> {
    const { mediaUrls, uploaderId, channel, cdnBaseUrl } = params;

    if (mediaUrls.length === 0) {
        return {
            storageKeys: [],
            isSensitive: false,
            mediaStatus: MediaModerationStatus.APPROVED,
        };
    }

    const storageKeys = mediaUrls.map((url) => toStorageKey(url, cdnBaseUrl));

    if (storageKeys.some((key) => key === null)) {
        throw new MediaNotOwnedError();
    }

    const keys = storageKeys as string[];

    const assets = await params.mediaAssetRepository.findByStorageKeys(keys);
    const byKey = new Map(assets.map((asset) => [asset.storageKey, asset]));

    let isSensitive = false;
    let hasPending = false;

    for (const key of keys) {
        const asset = byKey.get(key);

        // An asset already claimed by other content is refused too. One
        // upload backs one post: letting a key be reused would move it to the
        // newest claimant, and the older post would sit waiting on a verdict
        // that is being written somewhere else.
        if (
            !asset ||
            asset.channel !== channel ||
            asset.ownerId !== null ||
            !asset.canBeAttachedBy(uploaderId)
        ) {
            throw new MediaNotOwnedError();
        }

        if (asset.status === MediaModerationStatus.SENSITIVE) {
            isSensitive = true;
        }

        if (
            asset.status === MediaModerationStatus.PENDING ||
            asset.status === MediaModerationStatus.SCANNING
        ) {
            hasPending = true;
        }
    }

    return {
        storageKeys: keys,
        isSensitive,
        mediaStatus: hasPending
            ? MediaModerationStatus.PENDING
            : MediaModerationStatus.APPROVED,
    };
}
