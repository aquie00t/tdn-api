import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModeratePendingMediaUseCase } from "@core/use-cases/media/moderate-pending-media";
import { MediaAsset } from "@core/domain/entities/media-asset.entity";
import {
    MediaChannel,
    MediaKind,
    MediaModerationCategory,
    MediaModerationStatus,
    MediaOwnerKind,
    NotificationType,
} from "@core/domain/enums";
import type { IMediaAssetRepository } from "@core/ports/repositories/media-asset.repository";
import type { ICommentRepository } from "@core/ports/repositories/comment.repository";
import type { IMessageRepository } from "@core/ports/repositories/message.repository";
import type { INotificationRepository } from "@core/ports/repositories/notification.repository";
import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { MediaModerationPort } from "@core/ports/services/media-moderation.port";
import type { StoragePort } from "@core/ports/services/storage.port";
import type { RealtimePort } from "@core/ports/services/realtime.port";
import { ChatEvents } from "@core/domain/constants/chat-events.constants";

const CDN = "https://cdn.example.com";
const UPLOADER = "user-1";
const POST_ID = "post-1";
const KEY = "posts/user-1/clip.mp4";

/**
 * Builds a claimed video asset attached to a post.
 */
function videoAsset(overrides: Record<string, unknown> = {}): MediaAsset {
    return MediaAsset.with({
        id: "asset-1",
        storageKey: KEY,
        kind: MediaKind.VIDEO,
        mimeType: "video/mp4",
        byteSize: 1000,
        uploaderId: UPLOADER,
        channel: MediaChannel.POST_MEDIA,
        ownerId: POST_ID,
        ownerKind: MediaOwnerKind.POST,
        status: MediaModerationStatus.SCANNING,
        categories: [],
        attempts: 0,
        ...overrides,
    });
}

describe("ModeratePendingMediaUseCase", () => {
    let useCase: ModeratePendingMediaUseCase;
    let mediaAssetRepository: Pick<
        IMediaAssetRepository,
        | "claimPending"
        | "recordOutcome"
        | "recordFailedAttempt"
        | "findByOwner"
        | "findByStorageKeys"
    >;
    let moderation: MediaModerationPort;
    let storageService: Pick<StoragePort, "delete">;
    let postRepository: Pick<IPostRepository, "updateMediaState">;
    let commentRepository: Pick<
        ICommentRepository,
        "updateMediaState" | "findById"
    >;
    let messageRepository: Pick<
        IMessageRepository,
        "updateMediaState" | "findById"
    >;
    let notificationRepository: Pick<INotificationRepository, "create">;
    let realtimeService: Pick<RealtimePort, "emitToUser">;
    let logger: Pick<LoggerPort, "error" | "warn">;

    beforeEach(() => {
        mediaAssetRepository = {
            claimPending: vi.fn().mockResolvedValue([videoAsset()]),
            recordOutcome: vi.fn().mockResolvedValue(undefined),
            recordFailedAttempt: vi.fn().mockResolvedValue(1),
            // The worker re-reads the asset after scanning: the claim-time
            // snapshot predates the post that claims it.
            findByStorageKeys: vi.fn().mockResolvedValue([videoAsset()]),
            findByOwner: vi
                .fn()
                .mockResolvedValue([
                    videoAsset({ status: MediaModerationStatus.APPROVED }),
                ]),
        };
        moderation = {
            moderateImage: vi.fn(),
            moderateVideo: vi.fn().mockResolvedValue({
                verdict: MediaModerationStatus.APPROVED,
                categories: [],
                scores: {},
                provider: "fake",
            }),
        };
        storageService = { delete: vi.fn().mockResolvedValue(undefined) };
        postRepository = {
            updateMediaState: vi.fn().mockResolvedValue(undefined),
        };
        commentRepository = {
            updateMediaState: vi.fn().mockResolvedValue(undefined),
            findById: vi.fn().mockResolvedValue(null),
        };
        messageRepository = {
            updateMediaState: vi.fn().mockResolvedValue(undefined),
            findById: vi.fn().mockResolvedValue(null),
        };
        notificationRepository = {
            create: vi.fn().mockResolvedValue(undefined),
        };
        realtimeService = { emitToUser: vi.fn() };
        logger = { error: vi.fn(), warn: vi.fn() };

        useCase = new ModeratePendingMediaUseCase(
            mediaAssetRepository as IMediaAssetRepository,
            moderation,
            storageService as StoragePort,
            postRepository as IPostRepository,
            commentRepository as ICommentRepository,
            messageRepository as IMessageRepository,
            notificationRepository as INotificationRepository,
            realtimeService as RealtimePort,
            {
                batchSize: 10,
                maxAttempts: 3,
                leaseSeconds: 600,
                r2PublicUrl: CDN,
            },
            logger as LoggerPort,
        );
    });

    it("should hand the provider the CDN URL of the claimed asset", async () => {
        await useCase.execute();

        expect(moderation.moderateVideo).toHaveBeenCalledWith(`${CDN}/${KEY}`);
    });

    it("should report nothing to do when the queue is empty", async () => {
        vi.mocked(mediaAssetRepository.claimPending).mockResolvedValue([]);

        await expect(useCase.execute()).resolves.toEqual({
            scanned: 0,
            approved: 0,
            sensitive: 0,
            rejected: 0,
            failed: 0,
        });
    });

    it("should record a clean verdict and release the post's media", async () => {
        const result = await useCase.execute();

        expect(mediaAssetRepository.recordOutcome).toHaveBeenCalledWith(
            "asset-1",
            expect.objectContaining({
                status: MediaModerationStatus.APPROVED,
            }),
        );
        expect(postRepository.updateMediaState).toHaveBeenCalledWith(POST_ID, {
            mediaUrls: [`${CDN}/${KEY}`],
            isSensitive: false,
            mediaStatus: MediaModerationStatus.APPROVED,
        });
        expect(result.approved).toBe(1);
        expect(storageService.delete).not.toHaveBeenCalled();
    });

    describe("rejection", () => {
        beforeEach(() => {
            vi.mocked(moderation.moderateVideo).mockResolvedValue({
                verdict: MediaModerationStatus.REJECTED,
                categories: [MediaModerationCategory.GORE],
                scores: { "gore.prob": 0.95 },
                provider: "fake",
            });
            vi.mocked(mediaAssetRepository.findByOwner).mockResolvedValue([
                videoAsset({ status: MediaModerationStatus.REJECTED }),
            ]);
        });

        it("should delete the object and strip it from the post", async () => {
            const result = await useCase.execute();

            expect(storageService.delete).toHaveBeenCalledWith(KEY);
            expect(postRepository.updateMediaState).toHaveBeenCalledWith(
                POST_ID,
                expect.objectContaining({ mediaUrls: [] }),
            );
            expect(result.rejected).toBe(1);
        });

        it("should tell the uploader their media was removed", async () => {
            await useCase.execute();

            const [notification] = vi.mocked(notificationRepository.create).mock
                .calls[0];

            expect(notification.recipientId).toBe(UPLOADER);
            expect(notification.type).toBe(NotificationType.MEDIA_REJECTED);
        });

        it("should point a comment notification at the article it lives under", async () => {
            // An article is read by slug, and the slug only travels with the
            // notification when articleId is set. Without it the reader gets a
            // notice they cannot tap.
            const onComment = videoAsset({
                ownerKind: MediaOwnerKind.COMMENT,
                ownerId: "comment-1",
            });

            vi.mocked(mediaAssetRepository.claimPending).mockResolvedValue([
                onComment,
            ]);
            vi.mocked(mediaAssetRepository.findByStorageKeys).mockResolvedValue(
                [onComment],
            );
            vi.mocked(commentRepository.findById).mockResolvedValue({
                articleId: "article-9",
                postId: null,
            } as never);

            await useCase.execute();

            const [notification] = vi.mocked(notificationRepository.create).mock
                .calls[0];

            expect(notification.commentId).toBe("comment-1");
            expect(notification.articleId).toBe("article-9");
        });

        it("should strip a rejected video from the message carrying it", async () => {
            const onMessage = videoAsset({
                channel: MediaChannel.MESSAGE_MEDIA,
                ownerKind: MediaOwnerKind.MESSAGE,
                ownerId: "message-1",
            });

            vi.mocked(mediaAssetRepository.claimPending).mockResolvedValue([
                onMessage,
            ]);
            vi.mocked(mediaAssetRepository.findByStorageKeys).mockResolvedValue(
                [onMessage],
            );
            vi.mocked(messageRepository.findById).mockResolvedValue({
                id: "message-1",
                conversationId: "conv-1",
                senderId: UPLOADER,
            } as never);

            await useCase.execute();

            expect(messageRepository.updateMediaState).toHaveBeenCalledWith(
                "message-1",
                expect.objectContaining({ mediaUrls: [] }),
            );
        });

        it("should tell a message sender over the thread rather than the notification feed", async () => {
            // The notification target can only point at public content, so a
            // notification about a private message would be one the reader
            // cannot tap. The recipient is told nothing at all: the read path
            // withholds unscanned media, so for them the file never existed.
            const onMessage = videoAsset({
                channel: MediaChannel.MESSAGE_MEDIA,
                ownerKind: MediaOwnerKind.MESSAGE,
                ownerId: "message-1",
            });

            vi.mocked(mediaAssetRepository.claimPending).mockResolvedValue([
                onMessage,
            ]);
            vi.mocked(mediaAssetRepository.findByStorageKeys).mockResolvedValue(
                [onMessage],
            );
            vi.mocked(messageRepository.findById).mockResolvedValue({
                id: "message-1",
                conversationId: "conv-1",
                senderId: UPLOADER,
            } as never);

            await useCase.execute();

            expect(notificationRepository.create).not.toHaveBeenCalled();
            expect(realtimeService.emitToUser).toHaveBeenCalledWith(
                UPLOADER,
                ChatEvents.MESSAGE_MEDIA_REJECTED,
                expect.objectContaining({
                    conversationId: "conv-1",
                    messageId: "message-1",
                }),
            );
        });

        it("should leave a targetless notification when nothing claimed the asset", async () => {
            // A user can upload a video and never submit the post. The notice
            // still goes out, but it has nowhere to point.
            const orphan = videoAsset({ ownerId: null, ownerKind: null });

            vi.mocked(mediaAssetRepository.claimPending).mockResolvedValue([
                orphan,
            ]);
            vi.mocked(mediaAssetRepository.findByStorageKeys).mockResolvedValue(
                [orphan],
            );

            await useCase.execute();

            const [notification] = vi.mocked(notificationRepository.create).mock
                .calls[0];

            expect(notification.postId).toBeUndefined();
            expect(notification.commentId).toBeUndefined();
            expect(notification.articleId).toBeUndefined();
        });

        it("should keep going when the object cannot be deleted", async () => {
            // The verdict is already recorded and the read path already
            // withholds the file; a missed delete costs storage, not safety.
            vi.mocked(storageService.delete).mockRejectedValue(
                new Error("R2 down"),
            );

            await expect(useCase.execute()).resolves.toMatchObject({
                rejected: 1,
                failed: 0,
            });
            expect(logger.error).toHaveBeenCalled();
        });
    });

    it("should mark the owner sensitive when the verdict is borderline", async () => {
        vi.mocked(moderation.moderateVideo).mockResolvedValue({
            verdict: MediaModerationStatus.SENSITIVE,
            categories: [MediaModerationCategory.SUGGESTIVE],
            scores: {},
            provider: "fake",
        });
        vi.mocked(mediaAssetRepository.findByOwner).mockResolvedValue([
            videoAsset({ status: MediaModerationStatus.SENSITIVE }),
        ]);

        const result = await useCase.execute();

        expect(postRepository.updateMediaState).toHaveBeenCalledWith(
            POST_ID,
            expect.objectContaining({
                isSensitive: true,
                mediaUrls: [`${CDN}/${KEY}`],
                mediaStatus: MediaModerationStatus.APPROVED,
            }),
        );
        expect(result.sensitive).toBe(1);
    });

    it("should keep the owner pending while a sibling is still unscanned", async () => {
        vi.mocked(mediaAssetRepository.findByOwner).mockResolvedValue([
            videoAsset({ status: MediaModerationStatus.APPROVED }),
            videoAsset({
                id: "asset-2",
                storageKey: "posts/user-1/second.mp4",
                status: MediaModerationStatus.PENDING,
            }),
        ]);

        await useCase.execute();

        expect(postRepository.updateMediaState).toHaveBeenCalledWith(
            POST_ID,
            expect.objectContaining({
                mediaStatus: MediaModerationStatus.PENDING,
            }),
        );
    });

    it("should write a comment's verdict back to the comment repository", async () => {
        const onComment = videoAsset({
            ownerKind: MediaOwnerKind.COMMENT,
            ownerId: "comment-1",
        });

        vi.mocked(mediaAssetRepository.claimPending).mockResolvedValue([
            onComment,
        ]);
        vi.mocked(mediaAssetRepository.findByStorageKeys).mockResolvedValue([
            onComment,
        ]);

        await useCase.execute();

        expect(commentRepository.updateMediaState).toHaveBeenCalledWith(
            "comment-1",
            expect.anything(),
        );
        expect(postRepository.updateMediaState).not.toHaveBeenCalled();
    });

    it("should leave an unattached asset alone", async () => {
        vi.mocked(mediaAssetRepository.claimPending).mockResolvedValue([
            videoAsset({ ownerId: null, ownerKind: null }),
        ]);
        vi.mocked(mediaAssetRepository.findByStorageKeys).mockResolvedValue([
            videoAsset({ ownerId: null, ownerKind: null }),
        ]);

        await useCase.execute();

        expect(postRepository.updateMediaState).not.toHaveBeenCalled();
        expect(commentRepository.updateMediaState).not.toHaveBeenCalled();
    });

    it("should write to the owner that claimed the asset after it was claimed", async () => {
        // The common ordering: the worker picks up an upload before the post
        // using it is submitted. Trusting the claim-time snapshot would leave
        // that post withholding its media forever, since the asset now has a
        // verdict and is never claimed again.
        vi.mocked(mediaAssetRepository.claimPending).mockResolvedValue([
            videoAsset({ ownerId: null, ownerKind: null }),
        ]);
        vi.mocked(mediaAssetRepository.findByStorageKeys).mockResolvedValue([
            videoAsset({ ownerId: POST_ID, ownerKind: MediaOwnerKind.POST }),
        ]);

        await useCase.execute();

        expect(postRepository.updateMediaState).toHaveBeenCalledWith(
            POST_ID,
            expect.anything(),
        );
    });

    describe("failures", () => {
        beforeEach(() => {
            vi.mocked(moderation.moderateVideo).mockRejectedValue(
                new Error("provider down"),
            );
        });

        it("should release the asset for another attempt", async () => {
            const result = await useCase.execute();

            expect(mediaAssetRepository.recordFailedAttempt).toHaveBeenCalled();
            expect(result.failed).toBe(1);
            expect(storageService.delete).not.toHaveBeenCalled();
        });

        it("should give up and reject once the retry budget is spent", async () => {
            // A file that cannot be checked is one nobody has vouched for.
            // Leaving it pending forever would hide it just as thoroughly while
            // never telling the author to upload it again.
            vi.mocked(
                mediaAssetRepository.recordFailedAttempt,
            ).mockResolvedValue(3);

            await useCase.execute();

            expect(mediaAssetRepository.recordOutcome).toHaveBeenCalledWith(
                "asset-1",
                expect.objectContaining({
                    status: MediaModerationStatus.REJECTED,
                }),
            );
            expect(storageService.delete).toHaveBeenCalledWith(KEY);
            expect(notificationRepository.create).toHaveBeenCalled();
        });

        it("should not let the failure handler strand the rest of the batch", async () => {
            // handleFailure writes to the database too. If its own failure
            // escaped, every asset still claimed in this batch would be left
            // at SCANNING, which only the lease recovers from.
            vi.mocked(mediaAssetRepository.claimPending).mockResolvedValue([
                videoAsset({ id: "asset-1" }),
                videoAsset({ id: "asset-2" }),
            ]);
            vi.mocked(
                mediaAssetRepository.recordFailedAttempt,
            ).mockRejectedValue(new Error("database down"));

            await expect(useCase.execute()).resolves.toMatchObject({
                scanned: 2,
                failed: 2,
            });
            expect(logger.error).toHaveBeenCalled();
        });

        it("should not let one bad file block the rest of the batch", async () => {
            vi.mocked(mediaAssetRepository.claimPending).mockResolvedValue([
                videoAsset({ id: "asset-1" }),
                videoAsset({ id: "asset-2" }),
            ]);
            vi.mocked(moderation.moderateVideo)
                .mockRejectedValueOnce(new Error("provider down"))
                .mockResolvedValueOnce({
                    verdict: MediaModerationStatus.APPROVED,
                    categories: [],
                    scores: {},
                    provider: "fake",
                });

            await expect(useCase.execute()).resolves.toMatchObject({
                scanned: 2,
                failed: 1,
                approved: 1,
            });
        });
    });
});
