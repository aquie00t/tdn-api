import type {
    DeviceToken as PrismaDeviceToken,
    Prisma,
} from "@generated/prisma/client";
import { DeviceToken } from "@core/domain/entities/device-token.entity";
import type { DevicePlatform } from "@core/domain/enums";

/**
 * Two-way mapper between the `device_tokens` table and the domain entity.
 *
 * No `toResponse`: a push token is an address for reaching a phone, not
 * something the API hands back. The client already has its own.
 */
export class DeviceTokenPrismaMapper {
    /**
     * Maps a database row to the domain entity.
     *
     * @param row - The Prisma device token row
     * @returns The instantiated DeviceToken domain entity
     */
    public static toDomain(row: PrismaDeviceToken): DeviceToken {
        return DeviceToken.with({
            id: row.id,
            token: row.token,
            userId: row.userId,
            platform: row.platform as unknown as DevicePlatform,
            appVersion: row.appVersion,
            locale: row.locale,
            lastSeenAt: row.lastSeenAt,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        });
    }

    /**
     * The fields a registration writes, whether the row exists or not.
     *
     * Shared between both halves of the upsert so a device that re-registers
     * under a new account cannot keep a stale platform or locale from the old
     * one.
     *
     * @param device - The registration
     * @returns The Prisma update input
     */
    public static toPrismaUpdate(
        device: DeviceToken,
    ): Prisma.DeviceTokenUpdateInput {
        return {
            user: { connect: { id: device.userId } },
            platform: device.platform,
            appVersion: device.appVersion,
            locale: device.locale,
            lastSeenAt: new Date(),
        };
    }
}
