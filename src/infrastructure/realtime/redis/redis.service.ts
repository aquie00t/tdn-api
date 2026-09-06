import Redis from "ioredis";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { CachePort } from "@core/ports/services/cache.port";

export class RedisService implements CachePort {
    public readonly publisher: Redis;
    public readonly subscriber: Redis;
    private readonly logger: FastifyBaseLogger;

    constructor(logger: FastifyBaseLogger, config: FastifyInstance["config"]) {
        this.logger = logger;
        const redisUrl = config.REDIS_URL;

        this.publisher = new Redis(redisUrl);
        this.subscriber = this.publisher.duplicate();

        this.setupListeners();
    }

    private setupListeners(): void {
        this.publisher.on("connect", () => {
            this.logger.info(
                { event: "redis_publisher_connected" },
                "Redis Publisher connected",
            );
        });
        this.subscriber.on("connect", () => {
            this.logger.info(
                { event: "redis_subscriber_connected" },
                "Redis Subscriber connected",
            );
        });
        this.publisher.on("error", (err) => {
            this.logger.error(
                { event: "redis_publisher_error", error: err.message },
                "Redis Publisher Error",
            );
        });
        this.subscriber.on("error", (err) => {
            this.logger.error(
                { event: "redis_subscriber_error", error: err.message },
                "Redis Subscriber Error",
            );
        });
    }

    async disconnect(): Promise<void> {
        await this.publisher.quit();
        await this.subscriber.quit();
    }

    async get(key: string): Promise<string | null> {
        try {
            return await this.publisher.get(key);
        } catch (error) {
            this.logger.error(
                { err: error, key },
                "Failed to get data from Redis cache",
            );
            return null;
        }
    }

    async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
        try {
            if (ttlSeconds) {
                await this.publisher.set(key, value, "EX", ttlSeconds);
            } else {
                await this.publisher.set(key, value);
            }
        } catch (error) {
            this.logger.error(
                { err: error, key },
                "Failed to set data in Redis cache",
            );
        }
    }

    /**
     * Writes a value only when the key is not already taken.
     *
     * `SET NX EX` in one round trip: the store decides the race rather than
     * this process reading and then writing.
     *
     * Throws rather than swallowing, unlike its neighbours. A caller asking
     * "did I win the claim?" cannot be answered with silence - the two
     * possible lies are "you won" (two requests both proceed) and "you lost"
     * (a legitimate request is refused). It is for the caller to decide what a
     * cache outage means.
     *
     * @param key - The key to claim.
     * @param value - The value to write if the claim succeeds.
     * @param ttlSeconds - How long the claim lives.
     * @returns True when this caller took the key.
     */
    async setIfAbsent(
        key: string,
        value: string,
        ttlSeconds: number,
    ): Promise<boolean> {
        const result = await this.publisher.set(
            key,
            value,
            "EX",
            ttlSeconds,
            "NX",
        );

        return result === "OK";
    }

    async delete(key: string): Promise<void> {
        try {
            await this.publisher.del(key);
        } catch (error) {
            this.logger.error(
                { err: error, key },
                "Failed to delete key from Redis cache",
            );
        }
    }

    async deleteByPattern(pattern: string): Promise<void> {
        try {
            const keys: string[] = [];
            const stream = this.publisher.scanStream({
                match: pattern,
                count: 100,
            });

            await new Promise<void>((resolve, reject) => {
                stream.on("data", (batch: string[]) => {
                    keys.push(...batch);
                });
                stream.on("end", resolve);
                stream.on("error", reject);
            });

            if (keys.length > 0) {
                await this.publisher.unlink(...keys);
            }
        } catch (error) {
            this.logger.error(
                { err: error, pattern },
                "Failed to delete keys by pattern in Redis cache",
            );
        }
    }
}
