import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "../../../../src/generated/prisma/client";
import { PrismaUserRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-user.repository";
import { PrismaMediaAssetRepository } from "../../../../src/infrastructure/persistence/repositories/prisma-media-asset.repository";
import { MediaAsset } from "../../../../src/core/domain/entities/media-asset.entity";
import {
    MediaChannel,
    MediaKind,
    MediaModerationCategory,
    MediaModerationStatus,
    MediaOwnerKind,
} from "../../../../src/core/domain/enums";
import { createPrismaClient } from "../../helpers/setup";

const EMAIL_DOMAIN = "@media-asset-test.com";

/** Long enough that nothing in this suite is reclaimed mid-test. */
const LEASE_SECONDS = 600;

describe("PrismaMediaAssetRepository (integration)", () => {
    let prisma: PrismaClient;
    let repository: PrismaMediaAssetRepository;
    let userId: string;
    let otherUserId: string;
    let keyCounter = 0;

    /**
     * Stores a video asset in the given state.
     */
    async function store(
        status = MediaModerationStatus.PENDING,
        uploader = userId,
    ): Promise<MediaAsset> {
        keyCounter++;

        return await repository.create(
            MediaAsset.create({
                storageKey: `posts/${uploader}/${keyCounter}.mp4`,
                kind: MediaKind.VIDEO,
                mimeType: "video/mp4",
                byteSize: 1024,
                uploaderId: uploader,
                channel: MediaChannel.POST_MEDIA,
                verdict:
                    status === MediaModerationStatus.PENDING
                        ? undefined
                        : (status as never),
            }),
        );
    }

    beforeAll(async () => {
        prisma = createPrismaClient();

        const userRepository = new PrismaUserRepository(prisma, {
            gracePeriodDays: 30,
        });

        const user = await userRepository.create({
            email: `owner${EMAIL_DOMAIN}`,
            username: "media_owner",
            passwordHash: "hashed",
        });
        userId = user.id;

        const other = await userRepository.create({
            email: `other${EMAIL_DOMAIN}`,
            username: "media_other",
            passwordHash: "hashed",
        });
        otherUserId = other.id;

        repository = new PrismaMediaAssetRepository(prisma);
    });

    beforeEach(async () => {
        await prisma.mediaAsset.deleteMany({});
    });

    afterAll(async () => {
        await prisma.mediaAsset.deleteMany({});
        await prisma.user.deleteMany({
            where: { email: { endsWith: EMAIL_DOMAIN } },
        });
        await prisma.$disconnect();
    });

    it("should store an image with its verdict already in hand", async () => {
        const asset = await repository.create(
            MediaAsset.create({
                storageKey: "posts/img/clean.jpg",
                kind: MediaKind.IMAGE,
                mimeType: "image/jpeg",
                byteSize: 512,
                uploaderId: userId,
                channel: MediaChannel.POST_MEDIA,
                verdict: MediaModerationStatus.SENSITIVE,
                categories: [MediaModerationCategory.SUGGESTIVE],
                scores: { "nudity.suggestive": 0.61 },
                provider: "sightengine",
            }),
        );

        expect(asset.status).toBe(MediaModerationStatus.SENSITIVE);
        expect(asset.categories).toEqual([MediaModerationCategory.SUGGESTIVE]);
        expect(asset.scores).toEqual({ "nudity.suggestive": 0.61 });
    });

    it("should refuse to store the same storage key twice", async () => {
        const build = (): MediaAsset =>
            MediaAsset.create({
                storageKey: "posts/dupe/one.mp4",
                kind: MediaKind.VIDEO,
                mimeType: "video/mp4",
                byteSize: 1,
                uploaderId: userId,
                channel: MediaChannel.POST_MEDIA,
            });

        await repository.create(build());

        // A key resolving to two uploaders or two verdicts would make the
        // ownership check meaningless.
        await expect(repository.create(build())).rejects.toThrow();
    });

    it("should look assets up by their storage keys", async () => {
        const stored = await store();

        const found = await repository.findByStorageKeys([
            stored.storageKey,
            "posts/nobody/missing.mp4",
        ]);

        expect(found).toHaveLength(1);
        expect(found[0].storageKey).toBe(stored.storageKey);
        expect(found[0].uploaderId).toBe(userId);
    });

    it("should return nothing for an empty key list without querying", async () => {
        await expect(repository.findByStorageKeys([])).resolves.toEqual([]);
    });

    describe("claimPending", () => {
        it("should claim pending assets and move them to SCANNING", async () => {
            await store();
            await store();

            const claimed = await repository.claimPending(10, LEASE_SECONDS);

            expect(claimed).toHaveLength(2);
            expect(
                claimed.every(
                    (asset) => asset.status === MediaModerationStatus.SCANNING,
                ),
            ).toBe(true);
        });

        it("should leave assets that already have a verdict alone", async () => {
            await store(MediaModerationStatus.APPROVED);
            await store(MediaModerationStatus.REJECTED);

            await expect(repository.claimPending(10, LEASE_SECONDS)).resolves.toEqual([]);
        });

        it("should claim the oldest first and honour the batch size", async () => {
            const first = await store();
            await store();
            await store();

            const claimed = await repository.claimPending(1, LEASE_SECONDS);

            expect(claimed).toHaveLength(1);
            expect(claimed[0].storageKey).toBe(first.storageKey);
        });

        it("should never hand the same asset to two concurrent workers", async () => {
            // The API runs as several instances. Reading pending rows and then
            // updating them would leave a window where both read the same ones
            // and spend two provider calls on one verdict.
            await Promise.all([store(), store(), store(), store()]);

            const [a, b] = await Promise.all([
                repository.claimPending(4, LEASE_SECONDS),
                repository.claimPending(4, LEASE_SECONDS),
            ]);

            const ids = [...a, ...b].map((asset) => asset.id);

            expect(new Set(ids).size).toBe(ids.length);
            expect(ids).toHaveLength(4);
        });

        it("should reclaim an asset stranded past its lease", async () => {
            // A process killed between claiming and recording leaves the row
            // in SCANNING. Without the lease nothing selects it again and the
            // post carrying it withholds its media forever.
            const stranded = await store();
            await repository.claimPending(1, LEASE_SECONDS);

            await prisma.mediaAsset.update({
                where: { id: stranded.id },
                data: { updatedAt: new Date(Date.now() - 60 * 60 * 1000) },
            });

            const reclaimed = await repository.claimPending(1, LEASE_SECONDS);

            expect(reclaimed).toHaveLength(1);
            expect(reclaimed[0].id).toBe(stranded.id);
        });

        it("should leave a fresh claim to the worker that holds it", async () => {
            await store();
            await repository.claimPending(1, LEASE_SECONDS);

            await expect(
                repository.claimPending(1, LEASE_SECONDS),
            ).resolves.toEqual([]);
        });

        it("should return nothing for a non-positive limit", async () => {
            await store();

            await expect(repository.claimPending(0, LEASE_SECONDS)).resolves.toEqual([]);
        });
    });

    it("should record an outcome and clear the previous error", async () => {
        const asset = await store();

        await repository.recordFailedAttempt(asset.id, "provider down");
        await repository.recordOutcome(asset.id, {
            status: MediaModerationStatus.APPROVED,
            categories: [],
            scores: { "gore.prob": 0.01 },
            provider: "sightengine",
        });

        const row = await prisma.mediaAsset.findUniqueOrThrow({
            where: { id: asset.id },
        });

        expect(row.status).toBe(MediaModerationStatus.APPROVED);
        expect(row.lastError).toBeNull();
        expect(row.moderatedAt).not.toBeNull();
    });

    it("should count attempts and release the asset back to PENDING", async () => {
        const asset = await store();
        await repository.claimPending(1, LEASE_SECONDS);

        await expect(
            repository.recordFailedAttempt(asset.id, "timeout"),
        ).resolves.toBe(1);
        await expect(
            repository.recordFailedAttempt(asset.id, "timeout"),
        ).resolves.toBe(2);

        const row = await prisma.mediaAsset.findUniqueOrThrow({
            where: { id: asset.id },
        });

        // Back in the queue rather than stuck in SCANNING, or a crashed worker
        // would strand every asset it had claimed.
        expect(row.status).toBe(MediaModerationStatus.PENDING);
        expect(row.lastError).toBe("timeout");
    });

    it("should attach assets to their owner and read them back in upload order", async () => {
        const first = await store();
        const second = await store();
        await store(MediaModerationStatus.PENDING, otherUserId);

        await repository.attachToOwner(
            [first.storageKey, second.storageKey],
            MediaOwnerKind.POST,
            "post-abc",
        );

        const attached = await repository.findByOwner(
            MediaOwnerKind.POST,
            "post-abc",
        );

        expect(attached.map((asset) => asset.storageKey)).toEqual([
            first.storageKey,
            second.storageKey,
        ]);
    });

    it("should do nothing when attaching an empty key list", async () => {
        await expect(
            repository.attachToOwner([], MediaOwnerKind.POST, "post-abc"),
        ).resolves.toBe(0);
    });

    it("should refuse to attach an asset another owner already claimed", async () => {
        // The attach is the atomic claim: two posts submitting the same key
        // both pass the ownership check, and the count is what tells the
        // loser it lost.
        const asset = await store();

        await expect(
            repository.attachToOwner(
                [asset.storageKey],
                MediaOwnerKind.POST,
                "post-first",
            ),
        ).resolves.toBe(1);

        await expect(
            repository.attachToOwner(
                [asset.storageKey],
                MediaOwnerKind.POST,
                "post-second",
            ),
        ).resolves.toBe(0);

        const [stored] = await repository.findByStorageKeys([
            asset.storageKey,
        ]);
        expect(stored.ownerId).toBe("post-first");
    });

    it("should release every asset attached to one owner", async () => {
        const asset = await store();
        await repository.attachToOwner(
            [asset.storageKey],
            MediaOwnerKind.POST,
            "post-abc",
        );

        await repository.detachFromOwner(MediaOwnerKind.POST, "post-abc");

        await expect(
            repository.findByOwner(MediaOwnerKind.POST, "post-abc"),
        ).resolves.toEqual([]);
    });
});
