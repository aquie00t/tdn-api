import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterPlayPurchaseUseCase } from "@core/use-cases/billing/register-play-purchase";
import { BillingProvider, SubscriptionStatus } from "@core/domain/enums";
import type { BillingPort } from "@core/ports/services/billing.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { SyncSubscriptionUseCase } from "@core/use-cases/billing/sync-subscription";

const PERIOD_END = new Date("2026-12-01T00:00:00Z");

describe("RegisterPlayPurchaseUseCase", () => {
    let billing: BillingPort;
    let sync: Pick<SyncSubscriptionUseCase, "execute">;
    let logger: LoggerPort;
    let useCase: RegisterPlayPurchaseUseCase;

    const input = {
        currentUserId: "user-1",
        purchaseToken: "tok-1",
        productId: "verified_monthly",
    };

    beforeEach(() => {
        billing = {
            fetchSubscription: vi.fn().mockResolvedValue({
                providerSubscriptionId: "tok-1",
                status: SubscriptionStatus.ACTIVE,
                currentPeriodEnd: PERIOD_END,
            }),
            cancelSubscription: vi.fn(),
        };
        sync = {
            execute: vi
                .fn()
                .mockResolvedValue({ applied: true, verifiedUntil: PERIOD_END }),
        };
        logger = { error: vi.fn(), warn: vi.fn() } as unknown as LoggerPort;

        useCase = new RegisterPlayPurchaseUseCase(
            billing,
            sync as SyncSubscriptionUseCase,
            logger,
        );
    });

    it("should verify the purchase with the provider before granting anything", async () => {
        const result = await useCase.execute(input);

        expect(billing.fetchSubscription).toHaveBeenCalledWith("tok-1");
        expect(result.isVerified).toBe(true);
    });

    it("should store what the provider says, not what the client sent", async () => {
        await useCase.execute(input);

        expect(sync.execute).toHaveBeenCalledWith({
            userId: "user-1",
            provider: BillingProvider.GOOGLE_PLAY,
            state: expect.objectContaining({
                status: SubscriptionStatus.ACTIVE,
                currentPeriodEnd: PERIOD_END,
            }),
        });
    });

    it("should link an unconfirmable purchase as pending rather than drop it", async () => {
        // No adapter configured yet, or Google momentarily unreachable. The
        // link still has to be written: this request is the only thing that
        // knows whose purchase this is.
        vi.mocked(billing.fetchSubscription).mockResolvedValue(null);
        vi.mocked(sync.execute).mockResolvedValue({
            applied: true,
            verifiedUntil: null,
        });

        const result = await useCase.execute(input);

        expect(result.isVerified).toBe(false);
        expect(sync.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                state: expect.objectContaining({
                    providerSubscriptionId: "tok-1",
                    status: SubscriptionStatus.PENDING,
                }),
            }),
        );
        expect(logger.warn).toHaveBeenCalled();
    });

    it("should report no badge when the sync grants none", async () => {
        vi.mocked(sync.execute).mockResolvedValue({
            applied: false,
            reason: "claimed-by-another-account",
            verifiedUntil: null,
        });

        await expect(useCase.execute(input)).resolves.toEqual({
            isVerified: false,
        });
    });
});
