import type { MediaAsset } from "@core/domain/entities/media-asset.entity";
import type {
    MediaModerationCategory,
    MediaModerationStatus,
    MediaOwnerKind,
} from "@core/domain/enums";

/**
 * The media-related columns moderation owns on a post or a comment.
 */
export interface MediaState {
    /** The media URLs that survived moderation, in upload order. */
    mediaUrls: string[];

    /** Whether the client should blur what is left. */
    isSensitive: boolean;

    /** Whether anything attached is still unscanned or was rejected. */
    mediaStatus: MediaModerationStatus;
}

/**
 * The outcome the worker writes back after scanning a video.
 */
export interface MediaModerationOutcome {
    status: MediaModerationStatus;
    categories: MediaModerationCategory[];
    scores?: Record<string, number> | null;
    provider?: string | null;
}

/**
 * Port interface for media asset persistence.
 */
export interface IMediaAssetRepository {
    /**
     * Persists a newly uploaded asset.
     *
     * @param asset - The asset to store
     * @returns The stored asset, with its generated id
     */
    create(asset: MediaAsset): Promise<MediaAsset>;

    /**
     * Looks up assets by their storage keys.
     *
     * Keys not present in the table simply do not appear in the result, which
     * is what lets the caller reject a key nobody uploaded.
     *
     * @param storageKeys - The keys to resolve
     * @returns The assets that exist, in no particular order
     */
    findByStorageKeys(storageKeys: string[]): Promise<MediaAsset[]>;

    /**
     * Claims up to `limit` unscanned assets for this process.
     *
     * Must be atomic. The API runs as several instances - the realtime layer
     * exists precisely because it does - and two of them picking up the same
     * asset would spend two provider calls to reach one verdict.
     *
     * Assets left in SCANNING for longer than the lease are claimed again.
     * A process killed between claiming an asset and recording its verdict -
     * a redeploy, an OOM - would otherwise strand it in a state nothing
     * selects, and the post carrying it would withhold its media forever.
     *
     * @param limit - Most assets to claim in one batch
     * @param leaseSeconds - How long a claim is honoured before it is reclaimed
     * @returns The claimed assets, already moved to SCANNING
     */
    claimPending(limit: number, leaseSeconds: number): Promise<MediaAsset[]>;

    /**
     * Records the verdict for a scanned asset.
     *
     * @param id - The asset's id
     * @param outcome - The verdict and its supporting detail
     */
    recordOutcome(id: string, outcome: MediaModerationOutcome): Promise<void>;

    /**
     * Releases an asset back to PENDING after a failed attempt.
     *
     * @param id - The asset's id
     * @param error - What went wrong, for operators reading the table later
     * @returns The attempt count after the increment
     */
    recordFailedAttempt(id: string, error: string): Promise<number>;

    /**
     * Binds assets to the content that now uses them.
     *
     * The channel is not a parameter: it was fixed when the file was uploaded,
     * and the caller has already refused any key whose channel was wrong.
     *
     * Only assets nothing has claimed yet are attached, and the count of rows
     * actually written is returned so the caller can tell a race apart from a
     * success. Two requests can pass the same ownership check concurrently;
     * without the guard both would attach, the later one would win, and the
     * earlier post would hold media whose verdict is written somewhere else.
     *
     * @param storageKeys - The keys being attached
     * @param ownerKind - Whether a post or a comment is claiming them
     * @param ownerId - The id of that post or comment
     * @returns How many assets were attached
     */
    attachToOwner(
        storageKeys: string[],
        ownerKind: MediaOwnerKind,
        ownerId: string,
    ): Promise<number>;

    /**
     * Releases every asset attached to one piece of content.
     *
     * Used when content replaces its media: the superseded assets stop being
     * claimed, so a purge job reading "attached" as "in use" does not keep
     * them in storage forever.
     *
     * @param ownerKind - Whether the owner is a post, comment or article
     * @param ownerId - The owner's id
     */
    detachFromOwner(ownerKind: MediaOwnerKind, ownerId: string): Promise<void>;

    /**
     * Lists every asset attached to one piece of content, oldest first.
     *
     * The worker uses it to rebuild the owner's media list after a verdict:
     * the surviving assets in upload order are exactly what the content should
     * carry, which avoids having to describe the edit as a diff.
     *
     * @param ownerKind - Whether the owner is a post or a comment
     * @param ownerId - The owner's id
     * @returns The attached assets, oldest first
     */
    findByOwner(
        ownerKind: MediaOwnerKind,
        ownerId: string,
    ): Promise<MediaAsset[]>;
}
