import type { SeenPostsPort } from "@core/ports/services/seen-posts.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { RedisService } from "./redis.service";

/**
 * How long a post stays remembered as seen.
 *
 * Long enough that a reader who comes back the next evening is not shown
 * yesterday's feed again, short enough that a post they scrolled past a week
 * ago can resurface once it has earned its way back up the ranking.
 */
const SEEN_TTL_SECONDS = 48 * 60 * 60;

/**
 * Most posts one reader's seen set may hold.
 *
 * The set is trimmed rather than allowed to grow with a heavy reader's whole
 * history: an unbounded set costs memory forever and, worse, eventually
 * excludes so much that the feed has nothing left to serve.
 */
const MAX_SEEN_ENTRIES = 5000;

/**
 * Redis-backed record of what each reader has already been shown.
 *
 * Reuses the connection the cache adapter already owns rather than opening its
 * own, which is why it takes the service rather than a URL.
 *
 * Every method swallows its errors. A reader seeing a post twice because Redis
 * blinked is a far smaller problem than a feed request failing, and this is
 * the only component in the read path whose loss is survivable that way.
 */
export class RedisSeenPostsService implements SeenPostsPort {
    /**
     * Creates a new instance of RedisSeenPostsService.
     *
     * @param cacheService - The Redis adapter whose connection this shares
     * @param logger - Service for logging operations
     */
    constructor(
        private readonly cacheService: RedisService,
        private readonly logger: LoggerPort,
    ) {}

    /**
     * Records that these posts were served to this reader.
     *
     * Trimming happens here rather than on a timer, so the set is bounded by
     * the reader's own activity: someone who never opens the feed never pays
     * for a cleanup pass.
     *
     * @param userId - The reader the posts were served to.
     * @param postIds - The posts on the page.
     */
    async markSeen(userId: string, postIds: string[]): Promise<void> {
        if (postIds.length === 0) return;

        const key = this.keyFor(userId);

        try {
            // Sorted by the time they were seen, so trimming drops the oldest
            // rather than an arbitrary member the way a plain set would.
            const now = Date.now();
            const scored = postIds.flatMap((postId) => [now, postId]);

            const pipeline = this.cacheService.publisher.multi();
            pipeline.zadd(key, ...scored);
            // Keeps the newest MAX_SEEN_ENTRIES: rank 0 is the oldest, so this
            // removes everything below the cut.
            pipeline.zremrangebyrank(key, 0, -(MAX_SEEN_ENTRIES + 1));
            pipeline.expire(key, SEEN_TTL_SECONDS);
            await pipeline.exec();
        } catch (error) {
            this.logger.error(
                { err: error, userId },
                "Failed to record which posts a reader was shown",
            );
        }
    }

    /**
     * Narrows a list of posts to the ones this reader has not been shown.
     *
     * @param userId - The reader to check against.
     * @param postIds - The candidate posts.
     * @returns The subset the reader has not seen, in the order given. On any
     * failure the whole list comes back unfiltered, so a Redis outage degrades
     * into the feed repeating itself rather than into an empty feed.
     */
    async filterUnseen(userId: string, postIds: string[]): Promise<string[]> {
        if (postIds.length === 0) return [];

        try {
            // One round trip for the whole pool. Checking membership per post
            // would be several hundred round trips per feed build.
            const scores = await this.cacheService.publisher.zmscore(
                this.keyFor(userId),
                ...postIds,
            );

            return postIds.filter((_, index) => scores[index] === null);
        } catch (error) {
            this.logger.error(
                { err: error, userId },
                "Failed to read a reader's seen posts; serving unfiltered",
            );
            return postIds;
        }
    }

    /**
     * The key one reader's seen set is stored under.
     *
     * Outside the `posts:feed:` prefix on purpose: publishing a post must not
     * wipe what readers have already been shown.
     *
     * @param userId - The reader.
     * @returns The Redis key.
     */
    private keyFor(userId: string): string {
        return `feed:seen:${userId}`;
    }
}
