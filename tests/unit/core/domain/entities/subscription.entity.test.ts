import { describe, expect, it } from "vitest";
import { Subscription } from "@core/domain/entities/subscription.entity";
import { BillingProvider, SubscriptionStatus } from "@core/domain/enums";
import { isVerified } from "@core/use-cases/shared/verification/is-verified";

const PERIOD_END = new Date("2026-12-01T00:00:00Z");

function build(
    status: SubscriptionStatus,
    overrides: { currentPeriodEnd?: Date | null; lastEventAt?: Date | null } = {},
): Subscription {
    return Subscription.with({
        id: "sub-1",
        userId: "user-1",
        provider: BillingProvider.GOOGLE_PLAY,
        providerSubscriptionId: "gp-1",
        status,
        currentPeriodEnd:
            overrides.currentPeriodEnd === undefined
                ? PERIOD_END
                : overrides.currentPeriodEnd,
        lastEventAt: overrides.lastEventAt ?? null,
    });
}

describe("Subscription.entitlementUntil", () => {
    it("should entitle an active subscription until its period ends", () => {
        expect(build(SubscriptionStatus.ACTIVE).entitlementUntil()).toEqual(
            PERIOD_END,
        );
    });

    it("should keep entitling while a failed payment is being retried", () => {
        // The user paid for the period they are in; taking the badge away the
        // moment a card is declined punishes an expired card, not a decision
        // to stop paying.
        expect(build(SubscriptionStatus.IN_GRACE).entitlementUntil()).toEqual(
            PERIOD_END,
        );
    });

    it("should entitle nothing for pending, cancelled or revoked", () => {
        for (const status of [
            SubscriptionStatus.PENDING,
            SubscriptionStatus.CANCELED,
            SubscriptionStatus.REVOKED,
        ]) {
            expect(build(status).entitlementUntil()).toBeNull();
        }
    });

    it("should entitle nothing when there is no period at all", () => {
        expect(
            build(SubscriptionStatus.ACTIVE, {
                currentPeriodEnd: null,
            }).entitlementUntil(),
        ).toBeNull();
    });

    it("should report entitlement against a clock", () => {
        const subscription = build(SubscriptionStatus.ACTIVE);

        expect(subscription.isEntitled(new Date("2026-11-30T00:00:00Z"))).toBe(
            true,
        );
        expect(subscription.isEntitled(new Date("2026-12-02T00:00:00Z"))).toBe(
            false,
        );
    });
});

describe("Subscription.accepts", () => {
    const lastEventAt = new Date("2026-06-01T12:00:00Z");

    it("should accept an event newer than the one it was built from", () => {
        expect(
            build(SubscriptionStatus.ACTIVE, { lastEventAt }).accepts(
                new Date("2026-06-01T12:00:01Z"),
            ),
        ).toBe(true);
    });

    it("should refuse an older event", () => {
        // Store notifications are not ordered, and each carries the whole
        // state: an older one applied later would reinstate a subscription
        // that has ended.
        expect(
            build(SubscriptionStatus.ACTIVE, { lastEventAt }).accepts(
                new Date("2026-05-01T12:00:00Z"),
            ),
        ).toBe(false);
    });

    it("should accept a redelivery of the same event", () => {
        expect(
            build(SubscriptionStatus.ACTIVE, { lastEventAt }).accepts(
                lastEventAt,
            ),
        ).toBe(true);
    });

    it("should accept anything when nothing has been applied yet", () => {
        expect(
            build(SubscriptionStatus.ACTIVE).accepts(new Date("2020-01-01")),
        ).toBe(true);
    });

    it("should accept an undated event", () => {
        // A provider that does not date its notifications leaves nothing to
        // compare; refusing them all would mean never updating anything.
        expect(
            build(SubscriptionStatus.ACTIVE, { lastEventAt }).accepts(null),
        ).toBe(true);
    });
});

describe("isVerified", () => {
    it("should read an expiry in the future as verified", () => {
        expect(isVerified(new Date(Date.now() + 60_000))).toBe(true);
    });

    it("should read a passed expiry as not verified", () => {
        expect(isVerified(new Date(Date.now() - 60_000))).toBe(false);
    });

    it("should read an absent expiry as not verified", () => {
        expect(isVerified(null)).toBe(false);
        expect(isVerified(undefined)).toBe(false);
    });
});
