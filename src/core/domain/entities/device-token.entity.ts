import type { DevicePlatform } from "@core/domain/enums";
import type { DeviceTokenProps } from "@core/domain/interfaces/device-token-props.interface";

/**
 * Rich domain model for one app installation that may be notified.
 *
 * Thin by design - a token, who it belongs to and what it can tell us about
 * the phone - because everything interesting about push lives in deciding what
 * to send, not in the address it is sent to.
 */
export class DeviceToken {
    private constructor(private readonly props: DeviceTokenProps) {}

    /**
     * Creates a registration for a device that has just announced itself.
     *
     * @param params - The token and what the app knows about the device
     * @returns A new DeviceToken instance
     */
    public static create(params: {
        token: string;
        userId: string;
        platform: DevicePlatform;
        appVersion?: string | null;
        locale?: string | null;
    }): DeviceToken {
        return new DeviceToken({
            token: params.token,
            userId: params.userId,
            platform: params.platform,
            appVersion: params.appVersion ?? null,
            locale: params.locale ?? null,
            lastSeenAt: new Date(),
        });
    }

    /**
     * Rebuilds an entity from a persisted row.
     *
     * @param props - The stored shape
     * @returns The DeviceToken instance it describes
     */
    public static with(props: DeviceTokenProps): DeviceToken {
        return new DeviceToken(props);
    }

    get id(): string {
        return this.props.id!;
    }

    get token(): string {
        return this.props.token;
    }

    get userId(): string {
        return this.props.userId;
    }

    get platform(): DevicePlatform {
        return this.props.platform;
    }

    get appVersion(): string | null {
        return this.props.appVersion ?? null;
    }

    get locale(): string | null {
        return this.props.locale ?? null;
    }

    get lastSeenAt(): Date | undefined {
        return this.props.lastSeenAt;
    }
}
