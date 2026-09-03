import type {
    RealtimePort,
    RealtimeEventPayload,
} from "@core/ports/services/realtime.port";
import type { WebSocketManager } from "./websocket/websocket-manager";
import type { RedisService } from "./redis/redis.service";
import type { FastifyBaseLogger } from "fastify";

const REDIS_CHANNEL = "realtime_events";

interface RedisMessage {
    targetUserId: string;
    event: string;
    payload: RealtimeEventPayload;
}

export class FastifyRealtimeService implements RealtimePort {
    constructor(
        private readonly wsManager: WebSocketManager,
        private readonly cacheService: RedisService,
        private readonly logger: FastifyBaseLogger,
    ) {
        this.subscribeToRedis().catch((err) => {
            this.logger.error(
                { err: err instanceof Error ? err.message : String(err) },
                "Failed to initialize Redis subscription",
            );
        });
    }

    emitToUser(
        userId: string,
        event: string,
        payload: RealtimeEventPayload,
    ): void {
        const message: RedisMessage = { targetUserId: userId, event, payload };

        this.cacheService.publisher
            .publish(REDIS_CHANNEL, JSON.stringify(message))
            .catch((err) => {
                this.logger.error(
                    { err: err.message, userId },
                    "Failed to publish message to Redis",
                );
            });
    }

    private async subscribeToRedis(): Promise<void> {
        await this.cacheService.subscriber.subscribe(
            REDIS_CHANNEL,
            (err, count) => {
                if (err) {
                    this.logger.error(
                        { err: err.message },
                        "Failed to subscribe to Redis channel",
                    );
                    return;
                }
                this.logger.info(
                    { count },
                    "Successfully subscribed to Redis channels",
                );
            },
        );

        this.cacheService.subscriber.on("message", (channel, messageString) => {
            if (channel === REDIS_CHANNEL) {
                try {
                    const message: RedisMessage = JSON.parse(messageString);
                    this.handleIncomingRedisMessage(message);
                } catch (error) {
                    this.logger.error(
                        { error, messageString },
                        "Failed to parse Redis message",
                    );
                }
            }
        });
    }

    private handleIncomingRedisMessage(message: RedisMessage): void {
        const { targetUserId, event, payload } = message;

        const socket = this.wsManager.getClient(targetUserId);

        if (socket && socket.readyState === 1) {
            socket.send(JSON.stringify({ event, payload }));
            this.logger.info(
                { targetUserId, event },
                "Realtime event dispatched to local socket via Redis",
            );
        }
    }
}
