import type { MediaAsset } from "@core/domain/entities/media-asset.entity";
import { Notification } from "@core/domain/entities/notification.entity";
import {
    MediaModerationStatus,
    MediaOwnerKind,
    NotificationType,
} from "@core/domain/enums";
import type {
    IMediaAssetRepository,
    MediaState,
} from "@core/ports/repositories/media-asset.repository";
import type { ICommentRepository } from "@core/ports/repositories/comment.repository";
import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { MediaModerationPort } from "@core/ports/services/media-moderation.port";
import type { StoragePort } from "@core/ports/services/storage.port";
import { toMediaUrl } from "@core/use-cases/shared/media/media-url";
import type { ModeratePendingMediaOutput } from "./moderate-pending-media.output";

/**
 * Tuning for one pass of the worker.
 */
export interface ModeratePendingMediaConfig {
    /** Most assets to scan in one tick. */
    batchSize: number;

    /**
     * How many times a scan may fail before the asset is given up on.
     */
    maxAttempts: number;

    /**
     * How long a claim is honoured before another tick may take the asset
     * back. Bounds how long a crash mid-scan can withhold a post's media.
     */
    leaseSeconds: number;

    /** CDN origin the provider fetches stored videos from. */
    r2PublicUrl: string;
}

/**
 * Use case that scans the videos waiting for a verdict.
 *
 * Videos cannot be checked inside the upload request: the provider has to
 * fetch and sample the file, which takes far longer than a request may be held
 * open. They are therefore stored immediately, withheld by the read path, and
 * resolved here.
 */
export class ModeratePendingMediaUseCase {
    /**
     * Creates a new instance of ModeratePendingMediaUseCase.
     *
     * @param mediaAssetRepository - Repository the pending assets are claimed from
     * @param mediaModerationService - Automated content moderation
     * @param storageService - Object storage rejected files are deleted from
     * @param postRepository - Repository for posts carrying scanned media
     * @param commentRepository - Repository for comments carrying scanned media
     * @param notificationRepository - Repository used to tell an author their media was removed
     * @param moderatePendingMediaConfig - Batch size, retry budget and CDN origin
     * @param logger - Service for logging operations
     */
    constructor(
        private readonly mediaAssetRepository: IMediaAssetRepository,
        private readonly mediaModerationService: MediaModerationPort,
        private readonly storageService: StoragePort,
        private readonly postRepository: IPostRepository,
        private readonly commentRepository: ICommentRepository,
        private readonly notificationRepository: INotificationRepository,
        private readonly moderatePendingMediaConfig: ModeratePendingMediaConfig,
        private readonly logger: LoggerPort,
    ) {}

    /**
     * Scans one batch of pending videos.
     *
     * Assets are claimed atomically, so several API instances can run this on
     * the same schedule without paying twice for the same verdict.
     *
     * Each asset is handled independently: one provider failure must not stop
     * the rest of the batch, since the alternative is a single bad file
     * blocking every video behind it.
     *
     * @returns How many assets were scanned and how they came out
     */
    async execute(): Promise<ModeratePendingMediaOutput> {
        const claimed = await this.mediaAssetRepository.claimPending(
            this.moderatePendingMediaConfig.batchSize,
            this.moderatePendingMediaConfig.leaseSeconds,
        );

        const output: ModeratePendingMediaOutput = {
            scanned: claimed.length,
            approved: 0,
            sensitive: 0,
            rejected: 0,
            failed: 0,
        };

        for (const asset of claimed) {
            try {
                const status = await this.scan(asset);

                if (status === MediaModerationStatus.REJECTED)
                    output.rejected++;
                else if (status === MediaModerationStatus.SENSITIVE)
                    output.sensitive++;
                else output.approved++;
            } catch (error) {
                output.failed++;

                // The handler writes to the database too, so it can fail on
                // its own. Letting that escape would abandon every asset still
                // claimed in this batch at SCANNING, which is the one state
                // nothing else recovers from within a tick.
                try {
                    await this.handleFailure(asset, error);
                } catch (handlerError) {
                    this.logger.error(
                        {
                            context: "MediaModeration",
                            storageKey: asset.storageKey,
                            err: handlerError,
                        },
                        "Failed to record a failed media scan.",
                    );
                }
            }
        }

        return output;
    }

    /**
     * Scans one asset and applies the verdict.
     *
     * @param asset - The claimed asset
     * @returns The status the asset ended up in
     */
    private async scan(asset: MediaAsset): Promise<MediaModerationStatus> {
        const publicUrl = toMediaUrl(
            asset.storageKey,
            this.moderatePendingMediaConfig.r2PublicUrl,
        );

        const result =
            await this.mediaModerationService.moderateVideo(publicUrl);

        await this.mediaAssetRepository.recordOutcome(asset.id, {
            status: result.verdict,
            categories: result.categories,
            scores: result.scores,
            provider: result.provider,
        });

        if (result.verdict === MediaModerationStatus.REJECTED) {
            this.logger.warn(
                {
                    context: "MediaModeration",
                    storageKey: asset.storageKey,
                    uploaderId: asset.uploaderId,
                    categories: result.categories,
                },
                "Rejected an uploaded video.",
            );

            await this.deleteFromStorage(asset);
        }

        const owner = await this.refreshOwner(asset.storageKey);

        if (result.verdict === MediaModerationStatus.REJECTED) {
            await this.notifyUploader(asset, owner);
        }

        return result.verdict;
    }

    /**
     * Removes a rejected object from storage.
     *
     * A failure here is logged rather than raised: the verdict is already
     * recorded and the read path already withholds the file, so the only cost
     * of a missed delete is an orphaned object nobody has a URL for. Raising
     * would instead push the asset back to PENDING and have it scanned again.
     *
     * @param asset - The rejected asset
     */
    private async deleteFromStorage(asset: MediaAsset): Promise<void> {
        try {
            await this.storageService.delete(asset.storageKey);
        } catch (error) {
            this.logger.error(
                {
                    context: "MediaModeration",
                    storageKey: asset.storageKey,
                    err: error,
                },
                "Failed to delete rejected media from storage.",
            );
        }
    }

    /**
     * Rewrites the owning post or comment from its surviving assets.
     *
     * The asset is re-read rather than taken from the batch that was claimed,
     * and that is the whole point of the method taking a key. An upload is
     * routinely claimed by this worker before the post using it has been
     * submitted: the claim-time snapshot then says the asset belongs to
     * nobody, and trusting it would leave a post that was created seconds
     * later holding media that is withheld forever - the asset now has a
     * verdict, so nothing ever claims it again to try a second time.
     *
     * The new media list is rebuilt from the assets rather than edited in
     * place. The surviving assets, in upload order, already describe exactly
     * what the content should carry, and computing a removal against a row
     * that may have changed underneath is how a race turns into a media list
     * missing something it should have kept.
     *
     * @param storageKey - The key of the asset that was just scanned
     * @returns The owner the verdict was written to, if there was one
     */
    private async refreshOwner(
        storageKey: string,
    ): Promise<{ ownerId: string; ownerKind: MediaOwnerKind } | null> {
        const [fresh] = await this.mediaAssetRepository.findByStorageKeys([
            storageKey,
        ]);

        const ownerId = fresh?.ownerId;
        const ownerKind = fresh?.ownerKind;

        if (!ownerId || !ownerKind) return null;

        const siblings = await this.mediaAssetRepository.findByOwner(
            ownerKind,
            ownerId,
        );

        const state: MediaState = {
            mediaUrls: siblings
                .filter((sibling) => sibling.isServable)
                .map((sibling) =>
                    toMediaUrl(
                        sibling.storageKey,
                        this.moderatePendingMediaConfig.r2PublicUrl,
                    ),
                ),
            isSensitive: siblings.some(
                (sibling) => sibling.status === MediaModerationStatus.SENSITIVE,
            ),
            mediaStatus: siblings.some(
                (sibling) =>
                    sibling.status === MediaModerationStatus.PENDING ||
                    sibling.status === MediaModerationStatus.SCANNING,
            )
                ? MediaModerationStatus.PENDING
                : MediaModerationStatus.APPROVED,
        };

        if (ownerKind === MediaOwnerKind.POST) {
            await this.postRepository.updateMediaState(ownerId, state);
            return { ownerId, ownerKind };
        }

        if (ownerKind === MediaOwnerKind.COMMENT) {
            await this.commentRepository.updateMediaState(ownerId, state);
            return { ownerId, ownerKind };
        }

        // An article cover is always an image, and images are scanned inside
        // the upload request, so one can never reach the queue this worker
        // reads. Saying so out loud beats an else that would quietly write a
        // cover's verdict onto a comment if that ever stopped being true.
        this.logger.error(
            {
                context: "MediaModeration",
                storageKey,
                ownerKind,
            },
            "Claimed a pending asset whose owner kind cannot be pending.",
        );

        return null;
    }

    /**
     * Tells the uploader their media was removed.
     *
     * The notification is self-issued: it comes from the platform, and there
     * is no system account to attribute it to. The type carries the meaning,
     * so the client renders it as a moderation notice rather than as something
     * another user did.
     *
     * A failure is logged rather than raised. The removal is the part that
     * matters and it has already happened; retrying the whole scan to redeliver
     * a notice would spend another provider call on a file that is already
     * gone.
     *
     * @param asset - The rejected asset
     * @param owner - The content the asset was attached to, as re-read after
     * the scan; null when nothing claimed it
     */
    private async notifyUploader(
        asset: MediaAsset,
        owner: { ownerId: string; ownerKind: MediaOwnerKind } | null,
    ): Promise<void> {
        try {
            await this.notificationRepository.create(
                Notification.create(
                    asset.uploaderId,
                    asset.uploaderId,
                    NotificationType.MEDIA_REJECTED,
                    await this.notificationTarget(owner),
                ),
            );
        } catch (error) {
            this.logger.error(
                {
                    context: "MediaModeration",
                    storageKey: asset.storageKey,
                    err: error,
                },
                "Failed to notify the uploader about rejected media.",
            );
        }
    }

    /**
     * Resolves what the notification should point at.
     *
     * A comment on an article needs the article alongside it: the client reads
     * an article by slug, and the slug travels with the notification only when
     * `articleId` is set. Without it a rejected comment attachment produces a
     * notification the reader cannot tap. Comments on posts carry no article
     * and are unaffected.
     *
     * @param owner - The content the rejected asset was attached to
     * @returns The notification target, empty when nothing claimed the asset
     */
    private async notificationTarget(
        owner: { ownerId: string; ownerKind: MediaOwnerKind } | null,
    ): Promise<{ postId?: string; commentId?: string; articleId?: string }> {
        if (!owner) return {};

        if (owner.ownerKind === MediaOwnerKind.POST) {
            return { postId: owner.ownerId };
        }

        if (owner.ownerKind !== MediaOwnerKind.COMMENT) return {};

        const comment = await this.commentRepository.findById(owner.ownerId);

        return {
            commentId: owner.ownerId,
            articleId: comment?.articleId ?? undefined,
            postId: comment?.postId ?? undefined,
        };
    }

    /**
     * Records a failed scan and gives up once the retry budget is spent.
     *
     * Giving up rejects the asset rather than leaving it pending. A file that
     * cannot be checked is a file nobody has vouched for, and leaving it in
     * PENDING forever would hide it just as thoroughly while pretending the
     * question was still open - the author would never learn to re-upload it.
     *
     * @param asset - The asset that could not be scanned
     * @param error - What went wrong
     */
    private async handleFailure(
        asset: MediaAsset,
        error: unknown,
    ): Promise<void> {
        const message = error instanceof Error ? error.message : String(error);

        const attempts = await this.mediaAssetRepository.recordFailedAttempt(
            asset.id,
            message,
        );

        this.logger.error(
            {
                context: "MediaModeration",
                storageKey: asset.storageKey,
                attempts,
                err: error,
            },
            "Failed to scan a pending video.",
        );

        if (attempts < this.moderatePendingMediaConfig.maxAttempts) return;

        await this.mediaAssetRepository.recordOutcome(asset.id, {
            status: MediaModerationStatus.REJECTED,
            categories: [],
            provider: null,
        });

        await this.deleteFromStorage(asset);

        const owner = await this.refreshOwner(asset.storageKey);
        await this.notifyUploader(asset, owner);
    }
}
