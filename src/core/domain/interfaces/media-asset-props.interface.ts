import type {
    MediaKind,
    MediaModerationCategory,
    MediaModerationStatus,
    MediaChannel,
    MediaOwnerKind,
} from "@core/domain/enums";

/**
 * The persisted shape of a media asset.
 *
 * Everything the moderation pipeline knows about one stored file: where it
 * lives, who put it there, what it was uploaded for, and what the provider
 * said about it.
 */
export interface MediaAssetProps {
    /** Set once persisted. */
    id?: string;

    /** The R2 object key, without any CDN prefix. */
    storageKey: string;

    kind: MediaKind;

    /** Derived from the file's magic bytes, never from the client's claim. */
    mimeType: string;

    byteSize: number;

    uploaderId: string;

    channel: MediaChannel;

    /**
     * The post or comment the asset ended up on. Undefined until the content
     * that uses it is created.
     */
    ownerId?: string | null;

    /** Which table {@link MediaAssetProps.ownerId} points into. */
    ownerKind?: MediaOwnerKind | null;

    status: MediaModerationStatus;

    /** Flagged categories, kept so a rejection can be audited afterwards. */
    categories: MediaModerationCategory[];

    /** Raw provider scores, kept so thresholds can be retuned against real traffic. */
    scores?: Record<string, number> | null;

    provider?: string | null;

    moderatedAt?: Date | null;

    /** How many times the worker has tried and failed to reach a verdict. */
    attempts: number;

    lastError?: string | null;

    createdAt?: Date;
    updatedAt?: Date;
}
