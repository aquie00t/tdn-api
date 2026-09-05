import type { DevicePlatform } from "@core/domain/enums";

/**
 * The persisted shape of one app installation that may be notified.
 */
export interface DeviceTokenProps {
    /** Set once persisted. */
    id?: string;

    /** The Expo push token. Unique across users, not per user. */
    token: string;

    userId: string;

    platform: DevicePlatform;

    /** Build number of the app that registered. */
    appVersion?: string | null;

    /**
     * BCP-47 tag from the device.
     *
     * The phone's language rather than the profile's feed languages: a
     * notification is read on the lock screen, in whatever language that
     * screen is already in.
     */
    locale?: string | null;

    /** Refreshed on every registration. */
    lastSeenAt?: Date;

    createdAt?: Date;

    updatedAt?: Date;
}
