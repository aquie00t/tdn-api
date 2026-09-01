import type { MediaAsset as PrismaMediaAsset } from "@generated/prisma/client";
import { MediaAsset } from "@core/domain/entities/media-asset.entity";
import type {
    MediaKind,
    MediaModerationCategory,
    MediaModerationStatus,
    MediaChannel,
    MediaOwnerKind,
} from "@core/domain/enums";

/**
 * Two-way mapper between the `media_assets` table and the domain entity.
 *
 * There is no `toResponse`: an asset row is internal bookkeeping. What the API
 * exposes is the media URL on the post or comment that carries it, and the
 * scores behind a verdict are exactly the kind of detail that helps someone
 * work out what slips past the filter.
 */
export class MediaAssetPrismaMapper {
    /**
     * Maps a database row to the domain entity.
     *
     * The enum casts are safe because the domain enums mirror the Prisma ones
     * value for value, which is why they were written that way.
     *
     * @param row - The Prisma media asset row
     * @returns The instantiated MediaAsset domain entity
     */
    public static toDomain(row: PrismaMediaAsset): MediaAsset {
        return MediaAsset.with({
            id: row.id,
            storageKey: row.storageKey,
            kind: row.kind as unknown as MediaKind,
            mimeType: row.mimeType,
            byteSize: row.byteSize,
            uploaderId: row.uploaderId,
            channel: row.channel as unknown as MediaChannel,
            ownerId: row.ownerId,
            ownerKind: row.ownerKind as unknown as MediaOwnerKind | null,
            status: row.status as unknown as MediaModerationStatus,
            categories: row.categories as MediaModerationCategory[],
            scores: (row.scores as Record<string, number> | null) ?? null,
            provider: row.provider,
            moderatedAt: row.moderatedAt,
            attempts: row.attempts,
            lastError: row.lastError,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        });
    }

    /**
     * Maps a domain entity to the shape Prisma needs to insert it.
     *
     * @param asset - The asset to persist
     * @returns The create payload
     */
    public static toPrismaCreate(asset: MediaAsset): {
        storageKey: string;
        kind: MediaKind;
        mimeType: string;
        byteSize: number;
        uploaderId: string;
        channel: MediaChannel;
        status: MediaModerationStatus;
        categories: string[];
        scores: Record<string, number> | undefined;
        provider: string | null;
        moderatedAt: Date | null;
    } {
        return {
            storageKey: asset.storageKey,
            kind: asset.kind,
            mimeType: asset.mimeType,
            byteSize: asset.byteSize,
            uploaderId: asset.uploaderId,
            channel: asset.channel,
            status: asset.status,
            categories: asset.categories,
            scores: asset.scores ?? undefined,
            provider: asset.provider,
            moderatedAt: asset.moderatedAt,
        };
    }
}
