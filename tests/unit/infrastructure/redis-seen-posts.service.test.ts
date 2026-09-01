import { beforeEach, describe, expect, it, vi } from "vitest";
import { RedisSeenPostsService } from "@infrastructure/realtime/redis/redis-seen-posts.service";
import type { RedisService } from "@infrastructure/realtime/redis/redis.service";
import type { LoggerPort } from "@core/ports/services/logger.port";

describe("RedisSeenPostsService", () => {
    let service: RedisSeenPostsService;
    let pipeline: {
        zadd: ReturnType<typeof vi.fn>;
        zremrangebyrank: ReturnType<typeof vi.fn>;
        expire: ReturnType<typeof vi.fn>;
        exec: ReturnType<typeof vi.fn>;
    };
    let publisher: {
        multi: ReturnType<typeof vi.fn>;
        zmscore: ReturnType<typeof vi.fn>;
    };
    let logger: Pick<LoggerPort, "error">;

    beforeEach(() => {
        pipeline = {
            zadd: vi.fn(),
            zremrangebyrank: vi.fn(),
            expire: vi.fn(),
            exec: vi.fn().mockResolvedValue([]),
        };
        publisher = {
            multi: vi.fn(() => pipeline),
            zmscore: vi.fn().mockResolvedValue([]),
        };
        logger = { error: vi.fn() };

        service = new RedisSeenPostsService(
            { publisher } as unknown as RedisService,
            logger as LoggerPort,
        );
    });

    describe("markSeen", () => {
        it("should record every post on the page", async () => {
            await service.markSeen("user-1", ["p1", "p2"]);

            const [key, ...args] = pipeline.zadd.mock.calls[0];
            expect(key).toBe("feed:seen:user-1");
            expect(args).toContain("p1");
            expect(args).toContain("p2");
        });

        it("should trim to a bounded set, dropping the oldest", async () => {
            // An unbounded set costs memory forever and eventually excludes so
            // much that the feed has nothing left to serve.
            await service.markSeen("user-1", ["p1"]);

            const [key, start, stop] = pipeline.zremrangebyrank.mock.calls[0];
            expect(key).toBe("feed:seen:user-1");
            // Rank 0 is the oldest, so trimming from the bottom is what keeps
            // the newest entries.
            expect(start).toBe(0);
            expect(stop).toBeLessThan(0);
        });

        it("should refresh the expiry on every write", async () => {
            await service.markSeen("user-1", ["p1"]);

            const [key, ttl] = pipeline.expire.mock.calls[0];
            expect(key).toBe("feed:seen:user-1");
            expect(ttl).toBeGreaterThan(0);
        });

        it("should do nothing at all for an empty page", async () => {
            await service.markSeen("user-1", []);

            expect(publisher.multi).not.toHaveBeenCalled();
        });

        it("should swallow a Redis failure rather than failing the caller", async () => {
            pipeline.exec.mockRejectedValue(new Error("connection reset"));

            await expect(
                service.markSeen("user-1", ["p1"]),
            ).resolves.toBeUndefined();
            expect(logger.error).toHaveBeenCalled();
        });

        it("should keep one reader's set away from another's", async () => {
            await service.markSeen("user-1", ["p1"]);
            await service.markSeen("user-2", ["p1"]);

            expect(pipeline.zadd.mock.calls[0][0]).not.toBe(
                pipeline.zadd.mock.calls[1][0],
            );
        });

        it("should key outside the prefix that publishing a post purges", async () => {
            // A new post must not wipe what readers have already been shown.
            await service.markSeen("user-1", ["p1"]);

            expect(pipeline.zadd.mock.calls[0][0]).not.toMatch(/^posts:feed:/);
        });
    });

    describe("filterUnseen", () => {
        it("should drop the posts already in the set", async () => {
            publisher.zmscore.mockResolvedValue([null, 1234, null]);

            const unseen = await service.filterUnseen("user-1", [
                "p1",
                "p2",
                "p3",
            ]);

            expect(unseen).toEqual(["p1", "p3"]);
        });

        it("should preserve the order it was given", async () => {
            publisher.zmscore.mockResolvedValue([null, null, null]);

            const unseen = await service.filterUnseen("user-1", [
                "c",
                "a",
                "b",
            ]);

            expect(unseen).toEqual(["c", "a", "b"]);
        });

        it("should check the whole pool in one round trip", async () => {
            // Membership per post would be several hundred round trips per
            // feed build.
            const ids = Array.from({ length: 300 }, (_, i) => `p${i}`);
            publisher.zmscore.mockResolvedValue(ids.map(() => null));

            await service.filterUnseen("user-1", ids);

            expect(publisher.zmscore).toHaveBeenCalledTimes(1);
        });

        it("should return everything when nothing has been seen", async () => {
            publisher.zmscore.mockResolvedValue([null, null]);

            expect(await service.filterUnseen("user-1", ["p1", "p2"])).toEqual([
                "p1",
                "p2",
            ]);
        });

        it("should return nothing for an empty list without asking Redis", async () => {
            expect(await service.filterUnseen("user-1", [])).toEqual([]);
            expect(publisher.zmscore).not.toHaveBeenCalled();
        });

        it("should serve unfiltered when Redis is unreachable", async () => {
            // Degrading into a feed that repeats itself beats degrading into
            // an empty one.
            publisher.zmscore.mockRejectedValue(new Error("connection reset"));

            const unseen = await service.filterUnseen("user-1", ["p1", "p2"]);

            expect(unseen).toEqual(["p1", "p2"]);
            expect(logger.error).toHaveBeenCalled();
        });
    });
});
