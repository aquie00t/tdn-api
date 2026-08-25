import type {
    ITagRepository,
    TrendItem,
} from "@core/ports/repositories/tag.repository";
import type { CachePort } from "@core/ports/services/cache.port";
import type { GetTrendsInput } from "./get-trends-usecase.input";
import type { GetTrendsOutput } from "./get-trends-usecase.output";

const TREND_WINDOW_DAYS = 7;
const CACHE_TTL_SECONDS = 5 * 60;

export class GetTrendsUseCase {
    constructor(
        private readonly tagRepository: ITagRepository,
        private readonly cacheService: CachePort,
    ) {}

    async execute(input: GetTrendsInput): Promise<GetTrendsOutput> {
        const limit = input.limit ?? 10;
        // Versioned so entries cached before articleCount existed are not
        // served after a deploy: the response schema requires the field, and a
        // stale entry without it fails serialization rather than degrading.
        const cacheKey = `trends:v2:top:limit:${limit}:window:${TREND_WINDOW_DAYS}`;

        const cached = await this.cacheService.get(cacheKey);
        if (cached) {
            return { trends: JSON.parse(cached) as TrendItem[] };
        }

        const trends = await this.tagRepository.findTrending({
            limit,
            windowDays: TREND_WINDOW_DAYS,
        });

        await this.cacheService.set(
            cacheKey,
            JSON.stringify(trends),
            CACHE_TTL_SECONDS,
        );

        return { trends };
    }
}
