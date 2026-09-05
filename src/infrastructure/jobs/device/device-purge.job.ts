import type { PurgeStaleDevicesUseCase } from "@core/use-cases/device/purge-stale-devices";

/**
 * Runs one sweep of installations that stopped announcing themselves.
 */
export class DevicePurgeJob {
    /**
     * @param purgeStaleDevicesUseCase - The use case that removes them
     */
    constructor(
        private readonly purgeStaleDevicesUseCase: PurgeStaleDevicesUseCase,
    ) {}

    /**
     * Executes the sweep.
     *
     * @param retentionDays - How long an unseen device is kept
     * @returns How many registrations were removed
     */
    async run(retentionDays: number): Promise<number> {
        return this.purgeStaleDevicesUseCase.execute(retentionDays);
    }
}
