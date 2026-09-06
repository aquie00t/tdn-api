import { beforeEach, describe, expect, it, vi } from "vitest";
import { SyncSubscriptionUseCase } from "@core/use-cases/billing/sync-subscription";
import { RevokeSubscriptionUseCase } from "@core/use-cases/billing/revoke-subscription";
import { ReconcileSubscriptionsUseCase } from "@core/use-cases/billing/reconcile-subscriptions";
import { Subscription } from "@core/domain/entities/subscription.entity";
import { BillingProvider, SubscriptionStatus } from "@core/domain/enums";
import type { ISubscriptionRepository } from "@core/ports/repositories/subscription.repository";
import type { BillingPort } from "@core/ports/services/billing.port";
import type { LoggerPort } from "@core/ports/services/logger.port";

const PERIOD_END = new Date("2026-12-01T00:00:00Z");

function stored(overrides: Partial<Parameters<typeof Subscription.with>[0]> = {}) {
    return Subscription.with({
        id: "sub-1",
        userId: "user-1",
        provider: BillingProvider.GOOGLE_PLAY,
        providerSubscriptionId: "gp-1",
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: PERIOD_END,
        ...overrides,
    });
}

function repository(): ISubscriptionRepository {
    return {
        findByUserId: vi.fn().mockResolvedValue(null),
        findByProviderSubscriptionId: vi.fn().mockResolvedValue(null),
        save: vi.fn().mockImplementation((s: Subscription) => Promise.resolve(s)),
        setVerifiedUntil: vi.fn().mockResolvedValue(undefined),
        findReconcilable: vi.fn().mockResolvedValue([]),
    };
}

function logger(): LoggerPort {
    return { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as unknown as LoggerPort;
}

describe("SyncSubscriptionUseCase", () => {
    let repo: ISubscriptionRepository;
    let useCase: SyncSubscriptionUseCase;

    const state = {
        providerSubscriptionId: "gp-1",
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: PERIOD_END,
        eventAt: new Date("2026-11-01T00:00:00Z"),
    };

    beforeEach(() => {
        repo = repository();
        useCase = new SyncSubscriptionUseCase(repo, logger());
    });

    const input = {
        userId: "user-1",
        provider: BillingProvider.GOOGLE_PLAY,
        state,
    };

    it("should grant the badge for the period the provider reports", async () => {
        const result = await useCase.execute(input);

        expect(result.applied).toBe(true);
        expect(result.verifiedUntil).toEqual(PERIOD_END);
        expect(repo.setVerifiedUntil).toHaveBeenCalledWith(
            "user-1",
            PERIOD_END,
        );
    });

    it("should refuse a purchase already claimed by another account", async () => {
        // One receipt, one badge. Moving it would let a shared purchase grant
        // the badge to whoever presents it last.
        vi.mocked(repo.findByProviderSubscriptionId).mockResolvedValue(
            stored({ userId: "somebody-else" }),
        );

        const result = await useCase.execute(input);

        expect(result).toMatchObject({
            applied: false,
            reason: "claimed-by-another-account",
        });
        expect(repo.save).not.toHaveBeenCalled();
        expect(repo.setVerifiedUntil).not.toHaveBeenCalled();
    });

    it("should ignore an event older than the one already applied", async () => {
        vi.mocked(repo.findByProviderSubscriptionId).mockResolvedValue(
            stored({ lastEventAt: new Date("2026-11-15T00:00:00Z") }),
        );

        const result = await useCase.execute(input);

        expect(result).toMatchObject({ applied: false, reason: "stale-event" });
        expect(repo.save).not.toHaveBeenCalled();
    });

    it("should clear the badge when the provider says it ended", async () => {
        vi.mocked(repo.findByProviderSubscriptionId).mockResolvedValue(stored());

        const result = await useCase.execute({
            ...input,
            state: { ...state, status: SubscriptionStatus.CANCELED },
        });

        expect(result.verifiedUntil).toBeNull();
        expect(repo.setVerifiedUntil).toHaveBeenCalledWith("user-1", null);
    });

    it("should keep the provider customer id when an update omits it", async () => {
        vi.mocked(repo.findByProviderSubscriptionId).mockResolvedValue(
            stored({ providerCustomerId: "cust-1" }),
        );

        await useCase.execute(input);

        const saved = vi.mocked(repo.save).mock.calls[0]![0];

        expect(saved.providerCustomerId).toBe("cust-1");
    });
});

describe("RevokeSubscriptionUseCase", () => {
    let repo: ISubscriptionRepository;
    let billing: BillingPort;
    let useCase: RevokeSubscriptionUseCase;

    beforeEach(() => {
        repo = repository();
        vi.mocked(repo.findByUserId).mockResolvedValue(stored());
        billing = {
            fetchSubscription: vi.fn(),
            cancelSubscription: vi.fn().mockResolvedValue(true),
        };
        useCase = new RevokeSubscriptionUseCase(repo, billing, logger());
    });

    it("should cancel at the provider and take the badge away", async () => {
        await expect(useCase.execute("user-1")).resolves.toBe(true);

        expect(billing.cancelSubscription).toHaveBeenCalledWith("gp-1");
        expect(repo.setVerifiedUntil).toHaveBeenCalledWith("user-1", null);
        expect(vi.mocked(repo.save).mock.calls[0]![0].status).toBe(
            SubscriptionStatus.REVOKED,
        );
    });

    it("should still revoke locally when the provider refuses", async () => {
        // A provider outage must not leave a banned account wearing a badge;
        // the nightly reconcile retries the cancellation.
        vi.mocked(billing.cancelSubscription).mockRejectedValue(
            new Error("provider down"),
        );

        await expect(useCase.execute("user-1")).resolves.toBe(true);

        expect(repo.setVerifiedUntil).toHaveBeenCalledWith("user-1", null);
    });

    it("should do nothing for an account that never subscribed", async () => {
        vi.mocked(repo.findByUserId).mockResolvedValue(null);

        await expect(useCase.execute("user-1")).resolves.toBe(false);
        expect(billing.cancelSubscription).not.toHaveBeenCalled();
    });

    it("should do nothing when it has already been revoked", async () => {
        vi.mocked(repo.findByUserId).mockResolvedValue(
            stored({ status: SubscriptionStatus.REVOKED }),
        );

        await expect(useCase.execute("user-1")).resolves.toBe(false);
        expect(billing.cancelSubscription).not.toHaveBeenCalled();
    });
});

describe("ReconcileSubscriptionsUseCase", () => {
    let repo: ISubscriptionRepository;
    let billing: BillingPort;
    let sync: Pick<SyncSubscriptionUseCase, "execute">;
    let revoke: Pick<RevokeSubscriptionUseCase, "execute">;
    let useCase: ReconcileSubscriptionsUseCase;

    beforeEach(() => {
        repo = repository();
        billing = {
            fetchSubscription: vi.fn().mockResolvedValue(null),
            cancelSubscription: vi.fn().mockResolvedValue(true),
        };
        sync = {
            execute: vi
                .fn()
                .mockResolvedValue({ applied: true, verifiedUntil: PERIOD_END }),
        };
        revoke = { execute: vi.fn().mockResolvedValue(true) };

        useCase = new ReconcileSubscriptionsUseCase(
            repo,
            billing,
            sync as SyncSubscriptionUseCase,
            revoke as RevokeSubscriptionUseCase,
            logger(),
        );
    });

    it("should revoke a suspended account", async () => {
        // A ban is applied by hand in SQL and has no code path to hook. This
        // pass is the only thing that will ever notice.
        vi.mocked(repo.findReconcilable).mockResolvedValue([
            { subscription: stored(), isBanned: true, isDeleted: false },
        ]);

        const result = await useCase.execute(100);

        expect(revoke.execute).toHaveBeenCalledWith("user-1");
        expect(result.revoked).toBe(1);
        expect(billing.fetchSubscription).not.toHaveBeenCalled();
    });

    it("should revoke a deleted account whose cancellation did not land", async () => {
        vi.mocked(repo.findReconcilable).mockResolvedValue([
            { subscription: stored(), isBanned: false, isDeleted: true },
        ]);

        await useCase.execute(100);

        expect(revoke.execute).toHaveBeenCalledWith("user-1");
    });

    it("should re-apply what the provider reports", async () => {
        vi.mocked(repo.findReconcilable).mockResolvedValue([
            { subscription: stored(), isBanned: false, isDeleted: false },
        ]);
        vi.mocked(billing.fetchSubscription).mockResolvedValue({
            providerSubscriptionId: "gp-1",
            status: SubscriptionStatus.ACTIVE,
            currentPeriodEnd: PERIOD_END,
        });

        const result = await useCase.execute(100);

        expect(result.repaired).toBe(1);
        expect(sync.execute).toHaveBeenCalled();
    });

    it("should leave a row alone when the provider cannot say", async () => {
        // "I do not know this subscription" is not "it ended", and guessing
        // between them is how a paying user loses a badge.
        vi.mocked(repo.findReconcilable).mockResolvedValue([
            { subscription: stored(), isBanned: false, isDeleted: false },
        ]);
        vi.mocked(billing.fetchSubscription).mockResolvedValue(null);

        const result = await useCase.execute(100);

        expect(sync.execute).not.toHaveBeenCalled();
        expect(result.repaired).toBe(0);
    });

    it("should carry on after one row fails", async () => {
        vi.mocked(repo.findReconcilable).mockResolvedValue([
            {
                subscription: stored({ userId: "user-1" }),
                isBanned: false,
                isDeleted: false,
            },
            {
                subscription: stored({ userId: "user-2" }),
                isBanned: true,
                isDeleted: false,
            },
        ]);
        vi.mocked(billing.fetchSubscription).mockRejectedValue(
            new Error("provider down"),
        );

        const result = await useCase.execute(100);

        expect(result.examined).toBe(2);
        expect(result.revoked).toBe(1);
    });
});
