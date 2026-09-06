import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    mapPlayState,
    parsePlayNotification,
} from "@infrastructure/external/billing/play/play-notification";
import { PlayNotificationService } from "@infrastructure/external/billing/play/play-notification.service";
import { Subscription } from "@core/domain/entities/subscription.entity";
import { BillingProvider, SubscriptionStatus } from "@core/domain/enums";
import type { IBillingEventRepository } from "@core/ports/repositories/billing-event.repository";
import type { ISubscriptionRepository } from "@core/ports/repositories/subscription.repository";
import type { BillingPort } from "@core/ports/services/billing.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { SyncSubscriptionUseCase } from "@core/use-cases/billing/sync-subscription";

/**
 * Wraps a developer notification the way Pub/Sub pushes it.
 */
function push(payload: unknown, messageId = "msg-1"): unknown {
    return {
        message: {
            messageId,
            data: Buffer.from(JSON.stringify(payload)).toString("base64"),
        },
    };
}

describe("parsePlayNotification", () => {
    it("should unwrap a subscription notification", () => {
        const parsed = parsePlayNotification(
            push({
                eventTimeMillis: "1767225600000",
                subscriptionNotification: {
                    notificationType: 2,
                    purchaseToken: "tok-1",
                    subscriptionId: "verified_monthly",
                },
            }),
        );

        expect(parsed.kind).toBe("subscription");

        if (parsed.kind !== "subscription") return;

        expect(parsed.notification.purchaseToken).toBe("tok-1");
        expect(parsed.notification.typeName).toBe("SUBSCRIPTION_RENEWED");
        expect(parsed.notification.eventAt).toEqual(new Date(1767225600000));
    });

    it("should name a type Google has not documented here", () => {
        const parsed = parsePlayNotification(
            push({
                eventTimeMillis: "1767225600000",
                subscriptionNotification: {
                    notificationType: 99,
                    purchaseToken: "tok-1",
                },
            }),
        );

        if (parsed.kind !== "subscription") throw new Error("expected one");

        expect(parsed.notification.typeName).toBe("UNKNOWN_99");
    });

    it("should recognise the console's test notification", () => {
        // The first thing anybody does when wiring this up. Answering it as
        // malformed makes the integration look broken when it is not.
        expect(
            parsePlayNotification(push({ testNotification: { version: "1.0" } }))
                .kind,
        ).toBe("test");
    });

    it("should ignore rather than throw on anything unusable", () => {
        for (const body of [
            undefined,
            {},
            { message: {} },
            { message: { data: "not base64 json" } },
            push({ oneTimeProductNotification: {} }),
            push({ voidedPurchaseNotification: { purchaseToken: "t" } }),
        ]) {
            expect(parsePlayNotification(body).kind).toBe("ignored");
        }
    });

    it("should fall back to a key of its own when Pub/Sub sends no id", () => {
        const parsed = parsePlayNotification({
            message: {
                data: Buffer.from(
                    JSON.stringify({
                        eventTimeMillis: "1767225600000",
                        subscriptionNotification: {
                            notificationType: 2,
                            purchaseToken: "tok-1",
                        },
                    }),
                ).toString("base64"),
            },
        });

        if (parsed.kind !== "subscription") throw new Error("expected one");

        // A redelivery of the same event still collides on this.
        expect(parsed.notification.messageId).toBe("tok-1:1767225600000");
    });
});

describe("mapPlayState", () => {
    it("should entitle only active and grace", () => {
        expect(mapPlayState("SUBSCRIPTION_STATE_ACTIVE")).toBe(
            SubscriptionStatus.ACTIVE,
        );
        expect(mapPlayState("SUBSCRIPTION_STATE_IN_GRACE_PERIOD")).toBe(
            SubscriptionStatus.IN_GRACE,
        );
    });

    it("should treat paused and on-hold as not paying", () => {
        // Neither is being paid for, and the badge is a thing you have while
        // paying. Both come back on their own when Google says active again.
        expect(mapPlayState("SUBSCRIPTION_STATE_PAUSED")).toBe(
            SubscriptionStatus.CANCELED,
        );
        expect(mapPlayState("SUBSCRIPTION_STATE_ON_HOLD")).toBe(
            SubscriptionStatus.CANCELED,
        );
    });

    it("should read a state it does not know as not entitling", () => {
        // Google adds values over time; the safe reading of "I do not
        // recognise this" is that the badge is off, not on.
        expect(mapPlayState("SUBSCRIPTION_STATE_SOMETHING_NEW")).toBe(
            SubscriptionStatus.CANCELED,
        );
    });
});

describe("PlayNotificationService", () => {
    let billing: BillingPort;
    let subscriptions: Pick<
        ISubscriptionRepository,
        "findByProviderSubscriptionId"
    >;
    let events: IBillingEventRepository;
    let sync: Pick<SyncSubscriptionUseCase, "execute">;
    let service: PlayNotificationService;

    const stored = Subscription.with({
        id: "sub-1",
        userId: "user-1",
        provider: BillingProvider.GOOGLE_PLAY,
        providerSubscriptionId: "tok-1",
        status: SubscriptionStatus.ACTIVE,
    });

    const body = push({
        eventTimeMillis: "1767225600000",
        subscriptionNotification: {
            notificationType: 2,
            purchaseToken: "tok-1",
        },
    });

    beforeEach(() => {
        billing = {
            fetchSubscription: vi.fn().mockResolvedValue({
                providerSubscriptionId: "tok-1",
                status: SubscriptionStatus.ACTIVE,
                currentPeriodEnd: new Date("2026-12-01T00:00:00Z"),
            }),
            cancelSubscription: vi.fn(),
        };
        subscriptions = {
            findByProviderSubscriptionId: vi.fn().mockResolvedValue(stored),
        };
        events = { recordIfNew: vi.fn().mockResolvedValue(true) };
        sync = { execute: vi.fn().mockResolvedValue({ applied: true }) };

        service = new PlayNotificationService(
            billing,
            subscriptions as ISubscriptionRepository,
            events,
            sync as SyncSubscriptionUseCase,
            { error: vi.fn(), warn: vi.fn() } as unknown as LoggerPort,
        );
    });

    it("should ask Google what is true rather than believe the notification", async () => {
        await expect(service.handle(body)).resolves.toBe("applied");

        // The notification said "renewed"; what got stored is what the fetch
        // returned. Notifications arrive out of order and are redelivered, so
        // their contents are a nudge, never state.
        expect(billing.fetchSubscription).toHaveBeenCalledWith("tok-1");
        expect(sync.execute).toHaveBeenCalledWith(
            expect.objectContaining({ userId: "user-1" }),
        );
    });

    it("should do nothing twice for a redelivery", async () => {
        vi.mocked(events.recordIfNew).mockResolvedValue(false);

        await expect(service.handle(body)).resolves.toBe("duplicate");
        expect(billing.fetchSubscription).not.toHaveBeenCalled();
        expect(sync.execute).not.toHaveBeenCalled();
    });

    it("should not invent an account for a purchase nobody claims", async () => {
        // Google can push the purchase notification before the app's own
        // authenticated call arrives; that call is the only thing that knows
        // whose purchase it is.
        vi.mocked(subscriptions.findByProviderSubscriptionId).mockResolvedValue(
            null,
        );

        await expect(service.handle(body)).resolves.toBe("unknown-purchase");
        expect(sync.execute).not.toHaveBeenCalled();
    });

    it("should leave the row alone when Google cannot say", async () => {
        vi.mocked(billing.fetchSubscription).mockResolvedValue(null);

        await expect(service.handle(body)).resolves.toBe("unknown-purchase");
        expect(sync.execute).not.toHaveBeenCalled();
    });

    it("should record the delivery before acting on it", async () => {
        await service.handle(body);

        expect(events.recordIfNew).toHaveBeenCalledWith({
            id: "msg-1",
            provider: BillingProvider.GOOGLE_PLAY,
            type: "SUBSCRIPTION_RENEWED",
            providerSubscriptionId: "tok-1",
        });
    });

    it("should pass a test notification through untouched", async () => {
        await expect(
            service.handle(push({ testNotification: {} })),
        ).resolves.toBe("test");

        expect(events.recordIfNew).not.toHaveBeenCalled();
    });
});
