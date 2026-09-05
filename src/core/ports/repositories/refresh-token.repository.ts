import type { RefreshToken } from "@core/domain/entities/refresh-token.entity";

/**
 * Repository interface for managing RefreshToken entities.
 * Following Clean Architecture principles, this interface defines the contract
 * for persisting and retrieving RefreshToken domain entities without exposing
 * implementation details or DTOs.
 */
export interface IRefreshTokenRepository {
    /**
     * Creates a new refresh token entity in the persistence layer.
     * @param data - The refresh token data including token hash, user ID, device info, and expiration.
     * @returns The created RefreshToken entity.
     */
    create(data: {
        tokenHash: string;
        userId: string;
        deviceIp: string;
        userAgent: string;
        expiresAt: Date;
    }): Promise<RefreshToken>;

    /**
     * Retrieves a refresh token by its hashed value.
     * @param tokenHash - The hashed refresh token value.
     * @returns The RefreshToken entity if found, otherwise null.
     */
    findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;

    /**
     * Retrieves a refresh token by its own identifier.
     *
     * Used to follow a rotation chain: a retired token records which token
     * took its place, and a retry arriving inside the grace window has to
     * check that the successor is still live before it is trusted.
     *
     * @param id - The refresh token's identifier.
     * @returns The RefreshToken entity if found, otherwise null.
     */
    findById(id: string): Promise<RefreshToken | null>;

    /**
     * Updates an existing refresh token entity in the persistence layer.
     * @param refreshToken - The RefreshToken entity with updated values.
     */
    update(refreshToken: RefreshToken): Promise<void>;

    /**
     * Deletes all expired refresh tokens from the persistence layer.
     * @returns The number of deleted tokens.
     */
    deleteExpiredTokens(): Promise<number>;

    /**
     * Revokes all refresh tokens for a specific user.
     * @param userId - The unique identifier of the user.
     */
    revokeAllByUserId(userId: string): Promise<void>;
}
