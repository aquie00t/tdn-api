import type { IRefreshTokenRepository } from "@core/ports/repositories/refresh-token.repository";
import type { RefreshToken } from "@core/domain/entities/refresh-token.entity";
import { RefreshTokenPrismaMapper } from "@infrastructure/persistence/mappers/refresh-token.prisma.mapper";
import type { PrismaTransactionalClient } from "@infrastructure/persistence/database/prisma-client.type";

export interface PrismaRefreshTokenRepositoryOptions {
    gracePeriodDays: number;
}

export class PrismaRefreshTokenRepository implements IRefreshTokenRepository {
    constructor(
        private readonly prisma: PrismaTransactionalClient,
        private readonly options: PrismaRefreshTokenRepositoryOptions,
    ) {}

    async create(data: {
        tokenHash: string;
        userId: string;
        deviceIp: string;
        userAgent: string;
        expiresAt: Date;
    }): Promise<RefreshToken> {
        const rawToken = await this.prisma.refreshToken.create({
            data: {
                token: data.tokenHash,
                userId: data.userId,
                deviceIp: data.deviceIp,
                userAgent: data.userAgent,
                expiresAt: data.expiresAt,
            },
        });

        return RefreshTokenPrismaMapper.toDomain(rawToken);
    }

    async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
        const rawToken = await this.prisma.refreshToken.findUnique({
            where: { token: tokenHash },
        });

        if (!rawToken) return null;

        return RefreshTokenPrismaMapper.toDomain(rawToken);
    }

    async findById(id: string): Promise<RefreshToken | null> {
        const rawToken = await this.prisma.refreshToken.findUnique({
            where: { id },
        });

        if (!rawToken) return null;

        return RefreshTokenPrismaMapper.toDomain(rawToken);
    }

    async update(refreshToken: RefreshToken): Promise<void> {
        await this.prisma.refreshToken.update({
            where: { id: refreshToken.id },
            data: {
                isRevoked: refreshToken.isRevoked,
                revokedAt: refreshToken.revokedAt,
                replacedById: refreshToken.replacedById,
            },
        });
    }

    async deleteExpiredTokens(): Promise<number> {
        const now = new Date();
        const threshold = new Date();

        const days = this.options.gracePeriodDays;
        threshold.setDate(threshold.getDate() - days);

        const result = await this.prisma.refreshToken.deleteMany({
            where: {
                OR: [
                    { expiresAt: { lte: now } },
                    { createdAt: { lte: threshold } },
                ],
            },
        });
        return result.count;
    }

    async revokeAllByUserId(userId: string): Promise<void> {
        await this.prisma.refreshToken.updateMany({
            where: {
                userId,
                isRevoked: false,
            },
            data: {
                isRevoked: true,
            },
        });
    }
}
