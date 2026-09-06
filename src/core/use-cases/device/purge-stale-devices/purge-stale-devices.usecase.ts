import type { IDeviceTokenRepository } from "@core/ports/repositories/device-token.repository";

/**
 * Use case for dropping installations that have stopped announcing themselves.
 *
 * Expo reports the tokens it knows to be dead and those are deleted the moment
 * they are refused, but that only covers apps whose removal the platform
 * noticed. A phone that was reset, lost or simply abandoned reports nothing,
 * and its token would otherwise be carried - and paid for, in one HTTP call per
 * notification - for the rest of the account's life.
 *
 * The app re-registers at every launch, so age is a sound signal here in a way
 * it would not be for something a user only does once.
 */
export class PurgeStaleDevicesUseCase {
    /**
     * Creates a new instance of PurgeStaleDevicesUseCase.
     *
     * @param deviceTokenRepository - Where registrations are stored
     */
    constructor(
        private readonly deviceTokenRepository: IDeviceTokenRepository,
    ) {}

    /**
     * Executes the sweep.
     *
     * @param retentionDays - How long an unseen device is kept
     * @returns How many registrations were removed
     */
    async execute(retentionDays: number): Promise<number> {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - retentionDays);

        return this.deviceTokenRepository.deleteStale(cutoff);
    }
}
