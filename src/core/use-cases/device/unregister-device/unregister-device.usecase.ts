import type { IDeviceTokenRepository } from "@core/ports/repositories/device-token.repository";

/**
 * Input DTO for the UnregisterDeviceUseCase.
 */
export interface UnregisterDeviceInput {
    currentUserId: string;

    /** The Expo push token to stop notifying. */
    token: string;
}

/**
 * Use case for stopping notifications to one installation.
 *
 * Called when somebody signs out, and whenever they turn notifications off.
 * Signing out without this leaves the phone receiving somebody's notifications
 * after they have left it - which is the whole reason the app must call it
 * before it discards its session, not after.
 */
export class UnregisterDeviceUseCase {
    /**
     * Creates a new instance of UnregisterDeviceUseCase.
     *
     * @param deviceTokenRepository - Where registrations are stored
     */
    constructor(
        private readonly deviceTokenRepository: IDeviceTokenRepository,
    ) {}

    /**
     * Removes the device, if it belongs to the calling account.
     *
     * Scoped to the owner: a push token is not a secret - it travels through
     * the app and its logs - so holding one must not be enough to silence
     * somebody else's phone.
     *
     * Silent when there is nothing to remove. A sign-out that runs twice, or
     * one that follows a token the platform has already rotated, is not a
     * failure anybody can act on.
     *
     * @param input - The device being retired
     */
    async execute(input: UnregisterDeviceInput): Promise<void> {
        await this.deviceTokenRepository.deleteByToken(
            input.token,
            input.currentUserId,
        );
    }
}
