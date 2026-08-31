import { asClass } from "awilix";
import { RedisService } from "@infrastructure/realtime/redis/redis.service";
import { WebSocketManager } from "@infrastructure/realtime/websocket/websocket-manager";
import { FastifyRealtimeService } from "@infrastructure/realtime/fastify-realtime.service";
import { RedisSeenPostsService } from "@infrastructure/realtime/redis/redis-seen-posts.service";

export const realtimeModule = {
    // --- Services ---
    cacheService: asClass(RedisService).singleton(),
    // Shares the cache adapter's connection rather than opening a second one -
    // it resolves `cacheService` by parameter name.
    seenPostsService: asClass(RedisSeenPostsService).singleton(),
    wsManager: asClass(WebSocketManager).singleton(),
    realtimeService: asClass(FastifyRealtimeService).singleton(),
};
