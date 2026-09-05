import { DeviceToken } from "@core/domain/entities/device-token.entity";
import type { DevicePlatform } from "@core/domain/enums";
import type { IDeviceTokenRepository } from "@core/ports/repositories/device-token.repository";

/**
 * Input DTO for the RegisterDeviceUseCase.
 */
export interface RegisterDeviceInput {
    currentUserId: string;

    /** The Expo push token the app was issued. */
    token: string;

    platform: DevicePlatform;

    /** Build number of the app registering. */
    appVersion?: string;

    /** BCP-47 tag from the device, for the language notifications are written in. */
    locale?: string;
}

/**
 * Use case for registering an installation of the app for notifications.
 *
 * Called at every launch, not only the first: the token is the app's address
 * and can be reissued by the platform at any time, and re-registering is also
 * what keeps `lastSeenAt` honest enough to drop installations that are gone.
 */
export class RegisterDeviceUseCase {
    /**
     * Creates a new instance of RegisterDeviceUseCase.
     *
     * @param deviceTokenRepository - Where registrations are stored
     */
    constructor(
        private readonly deviceTokenRepository: IDeviceTokenRepository,
    ) {}

    /**
     * Records the device against the calling account.
     *
     * Idempotent, and a move rather than a duplicate when the same phone comes
     * back under a different account - which is what a shared device, or a
     * second account on the same phone, produces.
     *
     * @param input - The device announcing itself
     */
    async execute(input: RegisterDeviceInput): Promise<void> {
        await this.deviceTokenRepository.upsert(
            DeviceToken.create({
                token: input.token,
                userId: input.currentUserId,
                platform: input.platform,
                appVersion: input.appVersion ?? null,
                locale: input.locale ?? null,
            }),
        );
    }
}
