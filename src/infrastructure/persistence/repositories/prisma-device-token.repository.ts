import type { DeviceToken } from "@core/domain/entities/device-token.entity";
import type { IDeviceTokenRepository } from "@core/ports/repositories/device-token.repository";
import { DeviceTokenPrismaMapper } from "@infrastructure/persistence/mappers/device-token-prisma.mapper";
import type { PrismaTransactionalClient } from "@infrastructure/persistence/database/prisma-client.type";

/**
 * Prisma implementation of the device token repository.
 */
export class PrismaDeviceTokenRepository implements IDeviceTokenRepository {
    /**
     * @param prisma - Prisma client, possibly scoped to a transaction
     */
    constructor(private readonly prisma: PrismaTransactionalClient) {}

    /**
     * Records a device against an account, moving it if it belonged to
     * somebody else.
     *
     * The upsert is keyed on the token alone, which is what performs the move:
     * the update half connects the row to whoever is registering now.
     *
     * @param device - The registration to write.
     * @returns The stored device.
     */
    async upsert(device: DeviceToken): Promise<DeviceToken> {
        const row = await this.prisma.deviceToken.upsert({
            where: { token: device.token },
            update: DeviceTokenPrismaMapper.toPrismaUpdate(device),
            create: {
                token: device.token,
                userId: device.userId,
                platform: device.platform,
                appVersion: device.appVersion,
                locale: device.locale,
            },
        });

        return DeviceTokenPrismaMapper.toDomain(row);
    }

    /**
     * Removes one device, if it belongs to the account asking.
     *
     * @param token - The push token to remove.
     * @param userId - The account it must belong to.
     * @returns True when a row was removed.
     */
    async deleteByToken(token: string, userId: string): Promise<boolean> {
        const { count } = await this.prisma.deviceToken.deleteMany({
            where: { token, userId },
        });

        return count > 0;
    }

    /**
     * Reads every device registered to an account.
     *
     * @param userId - The account to look up.
     * @returns Its devices.
     */
    async findByUserId(userId: string): Promise<DeviceToken[]> {
        const rows = await this.prisma.deviceToken.findMany({
            where: { userId },
        });

        return rows.map((row) => DeviceTokenPrismaMapper.toDomain(row));
    }

    /**
     * Removes devices whose tokens the push service has rejected.
     *
     * @param tokens - The dead tokens.
     * @returns How many rows were removed.
     */
    async deleteByTokens(tokens: string[]): Promise<number> {
        if (tokens.length === 0) return 0;

        const { count } = await this.prisma.deviceToken.deleteMany({
            where: { token: { in: tokens } },
        });

        return count;
    }

    /**
     * Removes devices that have not re-registered in a long time.
     *
     * @param cutoff - Devices last seen before this are removed.
     * @returns How many rows were removed.
     */
    async deleteStale(cutoff: Date): Promise<number> {
        const { count } = await this.prisma.deviceToken.deleteMany({
            where: { lastSeenAt: { lt: cutoff } },
        });

        return count;
    }
}
