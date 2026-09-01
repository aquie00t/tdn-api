import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaAsset } from "@core/domain/entities/media-asset.entity";
import {
    MediaChannel,
    MediaKind,
    MediaModerationStatus,
} from "@core/domain/enums";
import { MediaNotOwnedError } from "@core/errors";
import type { IMediaAssetRepository } from "@core/ports/repositories/media-asset.repository";
import { resolveAttachableMedia } from "@core/use-cases/shared/media/resolve-attachable-media";
import { toStorageKey } from "@core/use-cases/shared/media/media-url";

const CDN = "https://cdn.example.com";
const OWNER = "user-1";
const KEY = "posts/user-1/abc.jpg";
const URL = `${CDN}/${KEY}`;

/**
 * Builds a stored asset, defaulting to one this owner may attach.
 */
function asset(overrides: Partial<Record<string, unknown>> = {}): MediaAsset {
    return MediaAsset.with({
        id: "asset-1",
        storageKey: KEY,
        kind: MediaKind.IMAGE,
        mimeType: "image/jpeg",
        byteSize: 100,
        uploaderId: OWNER,
        channel: MediaChannel.POST_MEDIA,
        status: MediaModerationStatus.APPROVED,
        categories: [],
        attempts: 0,
        ...overrides,
    });
}

describe("resolveAttachableMedia()", () => {
    let mediaAssetRepository: Pick<IMediaAssetRepository, "findByStorageKeys">;

    const resolve = (
        mediaUrls: string[],
        uploaderId = OWNER,
    ): ReturnType<typeof resolveAttachableMedia> =>
        resolveAttachableMedia({
            mediaUrls,
            uploaderId,
            channel: MediaChannel.POST_MEDIA,
            cdnBaseUrl: CDN,
            mediaAssetRepository: mediaAssetRepository as IMediaAssetRepository,
        });

    beforeEach(() => {
        mediaAssetRepository = {
            findByStorageKeys: vi.fn().mockResolvedValue([asset()]),
        };
    });

    it("should resolve a URL this uploader owns", async () => {
        await expect(resolve([URL])).resolves.toEqual({
            storageKeys: [KEY],
            isSensitive: false,
            mediaStatus: MediaModerationStatus.APPROVED,
        });
    });

    it("should short-circuit when there is no media", async () => {
        await expect(resolve([])).resolves.toEqual({
            storageKeys: [],
            isSensitive: false,
            mediaStatus: MediaModerationStatus.APPROVED,
        });

        expect(mediaAssetRepository.findByStorageKeys).not.toHaveBeenCalled();
    });

    it("should refuse a URL nobody uploaded", async () => {
        // This is the check that makes moderation mean anything: scanning at
        // upload time governs the upload endpoint, not what a client puts in a
        // post body.
        vi.mocked(mediaAssetRepository.findByStorageKeys).mockResolvedValue([]);

        await expect(resolve([URL])).rejects.toThrow(MediaNotOwnedError);
    });

    it("should refuse a URL pointing outside the CDN", async () => {
        await expect(
            resolve(["https://evil.example.com/whatever.jpg"]),
        ).rejects.toThrow(MediaNotOwnedError);
    });

    it("should refuse someone else's key", async () => {
        await expect(resolve([URL], "user-2")).rejects.toThrow(
            MediaNotOwnedError,
        );
    });

    it("should refuse a key moderation already rejected", async () => {
        vi.mocked(mediaAssetRepository.findByStorageKeys).mockResolvedValue([
            asset({ status: MediaModerationStatus.REJECTED }),
        ]);

        await expect(resolve([URL])).rejects.toThrow(MediaNotOwnedError);
    });

    it("should refuse a key uploaded through a different endpoint", async () => {
        // An avatar must not become post media: the two endpoints have
        // different rules, and the channel is what records which applied.
        vi.mocked(mediaAssetRepository.findByStorageKeys).mockResolvedValue([
            asset({ channel: MediaChannel.AVATAR }),
        ]);

        await expect(resolve([URL])).rejects.toThrow(MediaNotOwnedError);
    });

    it("should refuse a key some other content already claimed", async () => {
        // One upload backs one post. Reusing a key would move it to the newest
        // claimant, leaving the older post waiting on a verdict written
        // elsewhere.
        vi.mocked(mediaAssetRepository.findByStorageKeys).mockResolvedValue([
            asset({ ownerId: "post-1" }),
        ]);

        await expect(resolve([URL])).rejects.toThrow(MediaNotOwnedError);
    });

    it("should carry a sensitive asset onto the content", async () => {
        vi.mocked(mediaAssetRepository.findByStorageKeys).mockResolvedValue([
            asset({ status: MediaModerationStatus.SENSITIVE }),
        ]);

        await expect(resolve([URL])).resolves.toMatchObject({
            isSensitive: true,
            mediaStatus: MediaModerationStatus.APPROVED,
        });
    });

    it("should hold the content pending while an attached video is unscanned", async () => {
        vi.mocked(mediaAssetRepository.findByStorageKeys).mockResolvedValue([
            asset({ status: MediaModerationStatus.PENDING }),
        ]);

        await expect(resolve([URL])).resolves.toMatchObject({
            mediaStatus: MediaModerationStatus.PENDING,
        });
    });
});

describe("toStorageKey()", () => {
    it("should strip the CDN prefix", () => {
        expect(toStorageKey(URL, CDN)).toBe(KEY);
        expect(toStorageKey(URL, CDN + "/")).toBe(KEY);
    });

    it("should drop a cache-busting query", () => {
        expect(toStorageKey(`${URL}?v=1`, CDN)).toBe(KEY);
    });

    it("should pass a bare key through", () => {
        expect(toStorageKey(KEY, CDN)).toBe(KEY);
        expect(toStorageKey("/" + KEY, CDN)).toBe(KEY);
    });

    it("should refuse a URL on another origin", () => {
        expect(toStorageKey("https://evil.example.com/x.jpg", CDN)).toBeNull();
        // A prefix match alone is not enough: this host merely starts the same.
        expect(
            toStorageKey("https://cdn.example.com.evil.test/x.jpg", CDN),
        ).toBeNull();
    });

    it("should refuse traversal in either form", () => {
        expect(toStorageKey("../../etc/passwd", CDN)).toBeNull();
        expect(toStorageKey(`${CDN}/../secret.jpg`, CDN)).toBeNull();
    });

    it("should refuse an empty value", () => {
        expect(toStorageKey("   ", CDN)).toBeNull();
        expect(toStorageKey(CDN + "/", CDN)).toBeNull();
    });
});
