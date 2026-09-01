import type { MediaAsset } from "@core/domain/entities/media-asset.entity";
import { MediaModerationStatus, type MediaOwnerKind } from "@core/domain/enums";
import type {
    IMediaAssetRepository,
    MediaModerationOutcome,
} from "@core/ports/repositories/media-asset.repository";
import type { MediaAsset as PrismaMediaAsset } from "@generated/prisma/client";
import { Prisma } from "@generated/prisma/client";
import type { PrismaTransactionalClient } from "@infrastructure/persistence/database/prisma-client.type";
import { MediaAssetPrismaMapper } from "../mappers/media-asset-prisma.mapper";

/**
 * Prisma implementation of the media asset repository.
 */
export class PrismaMediaAssetRepository implements IMediaAssetRepository {
    /**
     * Initializes the PrismaMediaAssetRepository.
     *
     * @param prisma - The Prisma transactional client instance used for database operations.
     */
    constructor(private readonly prisma: PrismaTransactionalClient) {}

    /**
     * Persists a newly uploaded asset.
     *
     * @param asset - The asset to store
     * @returns The stored asset, with its generated id
     */
    async create(asset: MediaAsset): Promise<MediaAsset> {
        const created = await this.prisma.mediaAsset.create({
            data: MediaAssetPrismaMapper.toPrismaCreate(asset),
        });

        return MediaAssetPrismaMapper.toDomain(created);
    }

    /**
     * Looks up assets by their storage keys.
     *
     * @param storageKeys - The keys to resolve
     * @returns The assets that exist, in no particular order
     */
    async findByStorageKeys(storageKeys: string[]): Promise<MediaAsset[]> {
        if (storageKeys.length === 0) return [];

        const rows = await this.prisma.mediaAsset.findMany({
            where: { storageKey: { in: storageKeys } },
        });

        return rows.map((row) => MediaAssetPrismaMapper.toDomain(row));
    }

    /**
     * Claims up to `limit` unscanned assets for this process.
     *
     * Written as raw SQL because the claim has to be one statement. Reading
     * the pending rows and then updating them would leave a window in which a
     * second instance reads the same rows, and the API is deliberately run as
     * several instances. `FOR UPDATE SKIP LOCKED` is what makes concurrent
     * workers step over each other's rows rather than block on them.
     *
     * The lease is what makes a crash recoverable: SCANNING rows older than it
     * are treated as abandoned and claimed again. `updated_at` is written by
     * this statement, so it doubles as the claim timestamp.
     *
     * @param limit - Most assets to claim in one batch
     * @param leaseSeconds - How long a claim is honoured before it is reclaimed
     * @returns The claimed assets, already moved to SCANNING
     */
    async claimPending(
        limit: number,
        leaseSeconds: number,
    ): Promise<MediaAsset[]> {
        if (limit <= 0) return [];

        const rows = await this.prisma.$queryRaw<PrismaMediaAsset[]>(
            Prisma.sql`
                UPDATE media_assets
                SET status = 'SCANNING'::"MediaModerationStatus",
                    updated_at = NOW()
                WHERE id IN (
                    SELECT id
                    FROM media_assets
                    WHERE status = 'PENDING'::"MediaModerationStatus"
                       OR (
                            status = 'SCANNING'::"MediaModerationStatus"
                            AND updated_at <
                                NOW() - (${leaseSeconds} * INTERVAL '1 second')
                       )
                    ORDER BY created_at ASC
                    LIMIT ${limit}
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING
                    id,
                    storage_key   AS "storageKey",
                    kind,
                    mime_type     AS "mimeType",
                    byte_size     AS "byteSize",
                    uploader_id   AS "uploaderId",
                    channel,
                    owner_id      AS "ownerId",
                    owner_kind    AS "ownerKind",
                    status,
                    categories,
                    scores,
                    provider,
                    moderated_at  AS "moderatedAt",
                    attempts,
                    last_error    AS "lastError",
                    created_at    AS "createdAt",
                    updated_at    AS "updatedAt"
            `,
        );

        return rows.map((row) => MediaAssetPrismaMapper.toDomain(row));
    }

    /**
     * Records the verdict for a scanned asset.
     *
     * @param id - The asset's id
     * @param outcome - The verdict and its supporting detail
     */
    async recordOutcome(
        id: string,
        outcome: MediaModerationOutcome,
    ): Promise<void> {
        await this.prisma.mediaAsset.update({
            where: { id },
            data: {
                status: outcome.status,
                categories: outcome.categories,
                scores: outcome.scores ?? undefined,
                provider: outcome.provider,
                moderatedAt: new Date(),
                lastError: null,
            },
        });
    }

    /**
     * Releases an asset back to PENDING after a failed attempt.
     *
     * The message is truncated: a provider can return an HTML error page, and
     * a column holding one of those per failure is not worth the space.
     *
     * @param id - The asset's id
     * @param error - What went wrong, for operators reading the table later
     * @returns The attempt count after the increment
     */
    async recordFailedAttempt(id: string, error: string): Promise<number> {
        const updated = await this.prisma.mediaAsset.update({
            where: { id },
            data: {
                status: MediaModerationStatus.PENDING,
                attempts: { increment: 1 },
                lastError: error.slice(0, 500),
            },
            select: { attempts: true },
        });

        return updated.attempts;
    }

    /**
     * Binds assets to the content that now uses them.
     *
     * The `ownerId: null` filter is the guard: it makes the claim itself the
     * atomic step, so a key another request attached a moment earlier matches
     * nothing and the count comes back short.
     *
     * @param storageKeys - The keys being attached
     * @param ownerKind - Whether a post or a comment is claiming them
     * @param ownerId - The id of that post or comment
     * @returns How many assets were attached
     */
    async attachToOwner(
        storageKeys: string[],
        ownerKind: MediaOwnerKind,
        ownerId: string,
    ): Promise<number> {
        if (storageKeys.length === 0) return 0;

        const { count } = await this.prisma.mediaAsset.updateMany({
            where: { storageKey: { in: storageKeys }, ownerId: null },
            data: { ownerKind, ownerId },
        });

        return count;
    }

    /**
     * Releases every asset attached to one piece of content.
     *
     * @param ownerKind - Whether the owner is a post, comment or article
     * @param ownerId - The owner's id
     */
    async detachFromOwner(
        ownerKind: MediaOwnerKind,
        ownerId: string,
    ): Promise<void> {
        await this.prisma.mediaAsset.updateMany({
            where: { ownerKind, ownerId },
            data: { ownerKind: null, ownerId: null },
        });
    }

    /**
     * Lists every asset attached to one piece of content, oldest first.
     *
     * @param ownerKind - Whether the owner is a post or a comment
     * @param ownerId - The owner's id
     * @returns The attached assets, oldest first
     */
    async findByOwner(
        ownerKind: MediaOwnerKind,
        ownerId: string,
    ): Promise<MediaAsset[]> {
        const rows = await this.prisma.mediaAsset.findMany({
            where: { ownerKind, ownerId },
            orderBy: { createdAt: "asc" },
        });

        return rows.map((row) => MediaAssetPrismaMapper.toDomain(row));
    }
}
