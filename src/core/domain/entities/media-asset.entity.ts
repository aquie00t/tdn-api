import {
    MediaKind,
    MediaModerationStatus,
    type MediaModerationCategory,
    type MediaModerationVerdict,
    type MediaChannel,
    type MediaOwnerKind,
} from "@core/domain/enums";
import type { MediaAssetProps } from "@core/domain/interfaces/media-asset-props.interface";

/**
 * Rich domain model for a stored media file.
 *
 * The entity is what makes an uploaded storage key trustworthy. Content
 * creation looks a key up and refuses it unless the asset belongs to the
 * uploader and survived moderation, which is the only thing standing between
 * the pipeline and a client that simply puts its own URL in a post body.
 */
export class MediaAsset {
    private constructor(private readonly props: MediaAssetProps) {}

    /**
     * Creates a new asset record for a file that is about to be, or has just
     * been, written to storage.
     *
     * An image arrives with a verdict already in hand: it is scanned before a
     * byte reaches storage, so storing it as PENDING would describe a state it
     * was never in. A video has no verdict yet and starts PENDING for the
     * worker to pick up.
     *
     * @param params - The stored file and, for an image, its verdict
     * @returns A new MediaAsset instance
     */
    public static create(params: {
        storageKey: string;
        kind: MediaKind;
        mimeType: string;
        byteSize: number;
        uploaderId: string;
        channel: MediaChannel;
        verdict?: MediaModerationVerdict;
        categories?: MediaModerationCategory[];
        scores?: Record<string, number> | null;
        provider?: string | null;
    }): MediaAsset {
        return new MediaAsset({
            storageKey: params.storageKey,
            kind: params.kind,
            mimeType: params.mimeType,
            byteSize: params.byteSize,
            uploaderId: params.uploaderId,
            channel: params.channel,
            ownerId: null,
            ownerKind: null,
            status: params.verdict ?? MediaModerationStatus.PENDING,
            categories: params.categories ?? [],
            scores: params.scores ?? null,
            provider: params.provider ?? null,
            moderatedAt: params.verdict ? new Date() : null,
            attempts: 0,
            lastError: null,
        });
    }

    public static with(props: MediaAssetProps): MediaAsset {
        return new MediaAsset(props);
    }

    get id(): string {
        return this.props.id!;
    }

    get storageKey(): string {
        return this.props.storageKey;
    }

    get kind(): MediaKind {
        return this.props.kind;
    }

    get mimeType(): string {
        return this.props.mimeType;
    }

    get byteSize(): number {
        return this.props.byteSize;
    }

    get uploaderId(): string {
        return this.props.uploaderId;
    }

    get channel(): MediaChannel {
        return this.props.channel;
    }

    get ownerId(): string | null {
        return this.props.ownerId ?? null;
    }

    get ownerKind(): MediaOwnerKind | null {
        return this.props.ownerKind ?? null;
    }

    get status(): MediaModerationStatus {
        return this.props.status;
    }

    get categories(): MediaModerationCategory[] {
        return this.props.categories;
    }

    get scores(): Record<string, number> | null {
        return this.props.scores ?? null;
    }

    get provider(): string | null {
        return this.props.provider ?? null;
    }

    get moderatedAt(): Date | null {
        return this.props.moderatedAt ?? null;
    }

    get attempts(): number {
        return this.props.attempts;
    }

    get createdAt(): Date {
        return this.props.createdAt!;
    }

    /**
     * Whether the asset is a video, and therefore the worker's problem rather
     * than the upload request's.
     */
    get isVideo(): boolean {
        return this.props.kind === MediaKind.VIDEO;
    }

    /**
     * Whether the read path may serve this asset's URL.
     *
     * SENSITIVE counts as servable: the content it hangs off is marked
     * sensitive so the client blurs it, which is the point of having a middle
     * verdict at all.
     */
    get isServable(): boolean {
        return (
            this.props.status === MediaModerationStatus.APPROVED ||
            this.props.status === MediaModerationStatus.SENSITIVE
        );
    }

    /**
     * Whether this asset may be attached to new content by the given user.
     *
     * Ownership is checked here rather than at the call site because it is the
     * rule that makes the whole pipeline non-optional: an asset someone else
     * uploaded, or one that has already failed, can never travel into a post.
     *
     * @param userId - The id of the user creating the content
     * @returns True when the asset is theirs and has not been rejected
     */
    public canBeAttachedBy(userId: string): boolean {
        return (
            this.props.uploaderId === userId &&
            this.props.status !== MediaModerationStatus.REJECTED
        );
    }
}
