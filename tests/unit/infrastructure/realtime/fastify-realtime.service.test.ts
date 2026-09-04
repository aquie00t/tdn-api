import { beforeEach, describe, expect, it, vi } from "vitest";
import { FastifyRealtimeService } from "@infrastructure/realtime/fastify-realtime.service";
import type { RealtimeNotificationPayload } from "@core/ports/services/realtime.port";

const REDIS_CHANNEL = "realtime_events";

function makeSocket(readyState = 1) {
    return { readyState, send: vi.fn() };
}

describe("FastifyRealtimeService", () => {
    let onMessageHandler:
        ((channel: string, message: string) => void) | undefined;
    let mockPublisher: { publish: ReturnType<typeof vi.fn> };
    let mockSubscriber: {
        subscribe: ReturnType<typeof vi.fn>;
        on: ReturnType<typeof vi.fn>;
    };
    let mockWsManager: { getClient: ReturnType<typeof vi.fn> };
    let mockLogger: {
        error: ReturnType<typeof vi.fn>;
        info: ReturnType<typeof vi.fn>;
    };
    let service: FastifyRealtimeService;

    beforeEach(async () => {
        onMessageHandler = undefined;

        mockPublisher = { publish: vi.fn().mockResolvedValue(1) };
        mockSubscriber = {
            subscribe: vi.fn().mockResolvedValue(undefined),
            on: vi
                .fn()
                .mockImplementation((event: string, handler: unknown) => {
                    if (event === "message") {
                        onMessageHandler = handler as (
                            ch: string,
                            msg: string,
                        ) => void;
                    }
                }),
        };
        mockWsManager = { getClient: vi.fn() };
        mockLogger = { error: vi.fn(), info: vi.fn() };

        service = new FastifyRealtimeService(
            mockWsManager as any,
            { publisher: mockPublisher, subscriber: mockSubscriber } as any,
            mockLogger as any,
        );

        // wait for constructor's fire-and-forget subscribeToRedis() to resolve
        await Promise.resolve();
        await Promise.resolve();
    });

    describe("emitToUser", () => {
        it("should publish a JSON message to the Redis channel", () => {
            const payload: RealtimeNotificationPayload = {
                type: "FOLLOW",
                issuerId: "user-2",
            };

            service.emitToUser("user-1", "notification", payload);

            expect(mockPublisher.publish).toHaveBeenCalledWith(
                REDIS_CHANNEL,
                JSON.stringify({
                    targetUserId: "user-1",
                    event: "notification",
                    payload,
                }),
            );
        });

        it("should call logger.error and not throw when publish rejects", async () => {
            mockPublisher.publish.mockRejectedValue(new Error("Redis down"));

            expect(() =>
                service.emitToUser("user-1", "notification", {
                    type: "FOLLOW",
                    issuerId: "user-2",
                }),
            ).not.toThrow();

            await Promise.resolve();
            await Promise.resolve();

            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe("incoming Redis message handling", () => {
        it("should send to socket when client is found and readyState is OPEN (1)", () => {
            const socket = makeSocket(1);
            mockWsManager.getClient.mockReturnValue(socket);

            const msg = JSON.stringify({
                targetUserId: "user-1",
                event: "notification",
                payload: { type: "LIKE", issuerId: "user-2" },
            });

            onMessageHandler!(REDIS_CHANNEL, msg);

            expect(socket.send).toHaveBeenCalledWith(
                JSON.stringify({
                    event: "notification",
                    payload: { type: "LIKE", issuerId: "user-2" },
                }),
            );
        });

        it("should not throw when client socket is not found", () => {
            mockWsManager.getClient.mockReturnValue(undefined);

            expect(() =>
                onMessageHandler!(
                    REDIS_CHANNEL,
                    JSON.stringify({
                        targetUserId: "user-1",
                        event: "notification",
                        payload: { type: "LIKE", issuerId: "user-2" },
                    }),
                ),
            ).not.toThrow();
        });

        it("should not send when socket readyState is not OPEN", () => {
            const socket = makeSocket(3); // CLOSED
            mockWsManager.getClient.mockReturnValue(socket);

            onMessageHandler!(
                REDIS_CHANNEL,
                JSON.stringify({
                    targetUserId: "user-1",
                    event: "notification",
                    payload: { type: "LIKE", issuerId: "user-2" },
                }),
            );

            expect(socket.send).not.toHaveBeenCalled();
        });

        it("should ignore messages on a different channel", () => {
            const socket = makeSocket(1);
            mockWsManager.getClient.mockReturnValue(socket);

            onMessageHandler!(
                "other_channel",
                JSON.stringify({
                    targetUserId: "user-1",
                    event: "notification",
                    payload: { type: "LIKE", issuerId: "user-2" },
                }),
            );

            expect(socket.send).not.toHaveBeenCalled();
        });

        it("should call logger.error and not throw when message JSON is invalid", () => {
            expect(() =>
                onMessageHandler!(REDIS_CHANNEL, "{{invalid-json"),
            ).not.toThrow();

            expect(mockLogger.error).toHaveBeenCalled();
        });
    });
});
