import { asClass, asFunction } from "awilix";
import { RedisService } from "@infrastructure/realtime/redis/redis.service";
import { WebSocketManager } from "@infrastructure/realtime/websocket/websocket-manager";
import { FastifyRealtimeService } from "@infrastructure/realtime/fastify-realtime.service";
import { PushNotifyingRealtimeService } from "@infrastructure/realtime/push-notifying-realtime.service";
import { RedisSeenPostsService } from "@infrastructure/realtime/redis/redis-seen-posts.service";

export const realtimeModule = {
    // --- Services ---
    cacheService: asClass(RedisService).singleton(),
    // Shares the cache adapter's connection rather than opening a second one -
    // it resolves `cacheService` by parameter name.
    seenPostsService: asClass(RedisSeenPostsService).singleton(),
    wsManager: asClass(WebSocketManager).singleton(),
    /**
     * The socket transport on its own. Nothing resolves this directly; it is
     * what `realtimeService` wraps.
     */
    realtimeTransport: asClass(FastifyRealtimeService).singleton(),

    /**
     * The socket transport with push behind it.
     *
     * Registered under the name every use case already asks for, so a
     * notification reaches a backgrounded phone without a dozen call sites
     * learning that push exists.
     */
    realtimeService: asFunction(
        (realtimeTransport, sendPushNotificationUseCase) =>
            new PushNotifyingRealtimeService(
                realtimeTransport,
                sendPushNotificationUseCase,
            ),
    ).singleton(),
};
