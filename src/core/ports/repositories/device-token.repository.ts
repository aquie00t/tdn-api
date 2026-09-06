import type { DeviceToken } from "@core/domain/entities/device-token.entity";

/**
 * Repository interface for app installations that may be notified.
 */
export interface IDeviceTokenRepository {
    /**
     * Records a device against an account, moving it if it was registered to
     * somebody else.
     *
     * Keyed on the token rather than on the pair, deliberately. Phones get
     * handed over and accounts get switched inside the app; both produce the
     * same token under a new user, and anything other than a move would leave
     * one person's notifications arriving on another person's screen.
     *
     * @param device - The registration to write.
     * @returns The stored device.
     */
    upsert(device: DeviceToken): Promise<DeviceToken>;

    /**
     * Removes one device, if it belongs to the account asking.
     *
     * Scoped to the owner so that knowing a token is not enough to unregister
     * it - tokens travel through the app and are not secrets.
     *
     * @param token - The push token to remove.
     * @param userId - The account it must belong to.
     * @returns True when a row was removed.
     */
    deleteByToken(token: string, userId: string): Promise<boolean>;

    /**
     * Reads every device registered to an account.
     *
     * @param userId - The account to look up.
     * @returns Its devices, in no particular order.
     */
    findByUserId(userId: string): Promise<DeviceToken[]>;

    /**
     * Removes devices whose tokens the push service has rejected.
     *
     * @param tokens - The dead tokens.
     * @returns How many rows were removed.
     */
    deleteByTokens(tokens: string[]): Promise<number>;

    /**
     * Removes devices that have not re-registered in a long time.
     *
     * The app re-registers at launch, so a stale row is an installation that
     * is gone. Expo reports the tokens it knows to be dead, but a phone that
     * was reset or simply abandoned reports nothing, and age is the only
     * signal left.
     *
     * @param cutoff - Devices last seen before this are removed.
     * @returns How many rows were removed.
     */
    deleteStale(cutoff: Date): Promise<number>;
}
