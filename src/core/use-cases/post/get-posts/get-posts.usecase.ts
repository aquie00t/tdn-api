import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import type { CachePort } from "@core/ports/services/cache.port";
import type { GetPostsInput } from "./get-posts-usecase.input";
import type { GetPostsOutput } from "./get-posts-usecase.output";
import type { Post } from "@core/domain/entities/post.entity";
import { UnauthorizedError } from "@core/errors";
import { PostType } from "@core/domain/enums";
import {
    DEFAULT_LANGUAGE,
    normalizeLanguageTag,
    parseLanguagePreferenceHeader,
} from "@core/domain/constants/language.constants";
import { rankFeed, type FeedRankingWeights } from "./feed-ranking";

/**
 * How long a viewer's ranked order is reused before it is rebuilt.
 *
 * Short enough that a new post reaches the feed quickly, long enough that
 * paging through a feed does not re-rank underneath the reader - which is the
 * failure the previous per-page shuffle had, where the same post could appear
 * on two pages and another on none.
 */
const RANKED_FEED_TTL_SECONDS = 5 * 60;

/**
 * Bumped whenever the cached shape changes, so entries written by the previous
 * deploy are ignored rather than misread.
 */
const RANKED_FEED_CACHE_VERSION = "v1";

/**
 * The ranked order and the size of the result set it was built from.
 */
interface CachedRankedFeed {
    ids: string[];
    total: number;
}

/**
 * Use case for retrieving the post feed.
 *
 * Builds a ranked feed rather than a chronological one: the candidate pool for
 * the viewer's filters is scored by {@link rankFeed} - language first, then
 * who they follow, engagement and freshness - and the resulting order is
 * cached per viewer so that paging through it stays stable.
 */
export class GetPostsUseCase {
    /**
     * Creates a new instance of GetPostsUseCase.
     *
     * @param postRepository - Repository for reading posts and feed candidates
     * @param cacheService - Cache holding each viewer's ranked order
     * @param followUserRepository - Repository used to resolve who the viewer follows
     * @param profileRepository - Repository used to read the viewer's feed languages
     * @param feedRankingWeights - Tuning weights for the ranker
     * @param feedCandidatePoolSize - Hard cap on the candidate pool
     * @param feedCandidateWindowDays - How far back candidates may be drawn from
     */
    constructor(
        private readonly postRepository: IPostRepository,
        private readonly cacheService: CachePort,
        private readonly followUserRepository: IFollowRepository,
        private readonly profileRepository: IProfileRepository,
        private readonly feedRankingWeights: FeedRankingWeights,
        private readonly feedCandidatePoolSize: number,
        private readonly feedCandidateWindowDays: number,
    ) {}

    /**
     * Retrieves one page of the feed.
     *
     * @param input - Pagination, filters, the viewer and their Accept-Language
     * @returns The page of posts and the total number matching the filters
     *
     * @throws UnauthorizedError - When followedOnly is used without a viewer
     *
     * @remarks
     * The ranked order is built once per viewer and reused for
     * {@link RANKED_FEED_TTL_SECONDS}; only the ids are cached, and the page
     * itself is loaded fresh every time. That is deliberate: caching whole
     * posts would freeze the viewer's own like and bookmark state for the life
     * of the entry, and reading ten rows by primary key is cheap next to
     * getting that wrong.
     *
     * Ranking covers a bounded window of recent posts. Paging past it falls
     * through to the chronological tail, which excludes everything the ranked
     * head already served so that no post is shown twice or skipped.
     */
    async execute(input: GetPostsInput): Promise<GetPostsOutput> {
        const page = input.page || 1;
        const limit = input.limit || 10;
        const followedOnly = input.followedOnly ?? false;

        if (followedOnly && !input.currentUserId) {
            throw new UnauthorizedError(
                "Authentication is required to use the followedOnly filter.",
            );
        }

        if (!this.isRankable(input.type)) {
            return this.chronologicalPage(input, page, limit);
        }

        const languages = await this.resolveViewerLanguages(input);
        const followingIds = input.currentUserId
            ? await this.followUserRepository.getFollowingIds(
                  input.currentUserId,
              )
            : [];

        const { ids, total } = await this.rankedFeed(
            input,
            languages,
            followingIds,
            followedOnly,
        );

        const offset = (page - 1) * limit;

        if (offset >= ids.length) {
            return this.chronologicalTail(input, offset - ids.length, limit, {
                ids,
                total,
            });
        }

        const pageIds = ids.slice(offset, offset + limit);
        const posts = await this.postRepository.findByIds(
            pageIds,
            input.currentUserId,
        );

        return { posts: this.reorder(posts, pageIds), total };
    }

    /**
     * Decides whether a feed of this type should be ranked at all.
     *
     * Release notes are a changelog: reordering them by relevance makes a
     * product's history unreadable, and no amount of language matching is
     * worth that. Community posts, news and job postings all benefit from
     * being ranked - a Turkish job posting is more use to a Turkish reader
     * than an older one they cannot read.
     *
     * @param type - The post type the caller filtered on, if any.
     * @returns True when the feed should be ranked.
     */
    private isRankable(type?: PostType): boolean {
        return type !== PostType.SYSTEM_UPDATE;
    }

    /**
     * Resolves the languages to rank this viewer's feed for.
     *
     * A stored preference always wins; an empty one means the user never
     * chose, so the request's own `Accept-Language` is read next, and the
     * platform default answers for a visitor who sends neither.
     *
     * @param input - The feed request.
     * @returns The viewer's languages, never empty.
     */
    private async resolveViewerLanguages(
        input: GetPostsInput,
    ): Promise<string[]> {
        if (input.currentUserId) {
            const stored = await this.profileRepository.findLanguagesByUserId(
                input.currentUserId,
            );

            const supported = stored
                .map((tag) => normalizeLanguageTag(tag))
                .filter(
                    (code): code is NonNullable<typeof code> => code !== null,
                );

            if (supported.length > 0) return supported;
        }

        const fromHeader = parseLanguagePreferenceHeader(input.acceptLanguage);

        return fromHeader.length > 0 ? fromHeader : [DEFAULT_LANGUAGE];
    }

    /**
     * Returns the viewer's ranked order, building it when the cache is cold.
     *
     * @param input - The feed request.
     * @param languages - The viewer's languages.
     * @param followingIds - The accounts the viewer follows.
     * @param followedOnly - Whether the pool is restricted to those accounts.
     * @returns The ranked post ids and the total matching the filters.
     */
    private async rankedFeed(
        input: GetPostsInput,
        languages: string[],
        followingIds: string[],
        followedOnly: boolean,
    ): Promise<CachedRankedFeed> {
        const cacheKey = this.rankedFeedCacheKey(
            input,
            languages,
            followedOnly,
        );

        const cached = await this.cacheService.get(cacheKey);
        if (cached) {
            return JSON.parse(cached) as CachedRankedFeed;
        }

        const since = new Date(
            Date.now() - this.feedCandidateWindowDays * 24 * 60 * 60 * 1000,
        );

        const scopedFollowingIds =
            followedOnly && input.currentUserId ? followingIds : undefined;

        const [candidates, total] = await Promise.all([
            this.postRepository.findFeedCandidates({
                type: input.type,
                tag: input.tag,
                categories: input.categories,
                followingIds: scopedFollowingIds,
                since,
                limit: this.feedCandidatePoolSize,
            }),
            this.postRepository.countAll({
                type: input.type,
                tag: input.tag,
                categories: input.categories,
                followingIds: scopedFollowingIds,
            }),
        ]);

        const ranked = rankFeed(
            candidates,
            {
                languages,
                followingIds: new Set(followingIds),
                now: new Date(),
            },
            this.feedRankingWeights,
        );

        const feed: CachedRankedFeed = {
            ids: ranked.map((candidate) => candidate.id),
            total,
        };

        await this.cacheService.set(
            cacheKey,
            JSON.stringify(feed),
            RANKED_FEED_TTL_SECONDS,
        );

        return feed;
    }

    /**
     * Builds the cache key a viewer's ranked order is stored under.
     *
     * The languages are part of the key, not just the viewer: two anonymous
     * visitors with different `Accept-Language` headers must not share an
     * order, and the same user changing their preference must not keep the old
     * one until it expires.
     *
     * Kept under the `posts:feed:` prefix so the existing invalidation on post
     * creation clears it.
     *
     * @param input - The feed request.
     * @param languages - The viewer's resolved languages.
     * @param followedOnly - Whether the pool is restricted to followed accounts.
     * @returns The cache key.
     */
    private rankedFeedCacheKey(
        input: GetPostsInput,
        languages: string[],
        followedOnly: boolean,
    ): string {
        const categories =
            input.categories && input.categories.length > 0
                ? [...input.categories].sort().join(",")
                : "ALL";

        return [
            "posts:feed:ranked",
            RANKED_FEED_CACHE_VERSION,
            `user:${input.currentUserId || "guest"}`,
            `langs:${languages.join(",")}`,
            `type:${input.type || "ALL"}`,
            `tag:${input.tag ?? "ALL"}`,
            `categories:${categories}`,
            `followedOnly:${followedOnly}`,
        ].join(":");
    }

    /**
     * Serves a page from beyond the ranked window.
     *
     * @param input - The feed request.
     * @param skip - How far past the ranked head the page starts.
     * @param limit - Page size.
     * @param ranked - The ranked order, whose ids this page must not repeat.
     * @returns The page of posts and the unchanged total.
     */
    private async chronologicalTail(
        input: GetPostsInput,
        skip: number,
        limit: number,
        ranked: CachedRankedFeed,
    ): Promise<GetPostsOutput> {
        const { posts } = await this.postRepository.findAll({
            page: 1,
            skip,
            limit,
            type: input.type,
            currentUserId: input.currentUserId,
            tag: input.tag,
            categories: input.categories,
            excludeIds: ranked.ids,
            ...(input.followedOnly && input.currentUserId
                ? {
                      followingIds:
                          await this.followUserRepository.getFollowingIds(
                              input.currentUserId,
                          ),
                  }
                : {}),
        });

        return { posts, total: ranked.total };
    }

    /**
     * Serves a feed that is not ranked at all, newest first.
     *
     * @param input - The feed request.
     * @param page - The requested page.
     * @param limit - Page size.
     * @returns The page of posts and the total matching the filters.
     */
    private async chronologicalPage(
        input: GetPostsInput,
        page: number,
        limit: number,
    ): Promise<GetPostsOutput> {
        return this.postRepository.findAll({
            page,
            limit,
            type: input.type,
            currentUserId: input.currentUserId,
            tag: input.tag,
            categories: input.categories,
            ...(input.followedOnly && input.currentUserId
                ? {
                      followingIds:
                          await this.followUserRepository.getFollowingIds(
                              input.currentUserId,
                          ),
                  }
                : {}),
        });
    }

    /**
     * Puts a hydrated page back into the order the ranker asked for.
     *
     * Ids that no longer resolve are dropped rather than left as holes: a post
     * deleted between ranking and hydration should shorten the page, not fail
     * it.
     *
     * @param posts - The hydrated posts, in arbitrary order.
     * @param ids - The ids in ranked order.
     * @returns The posts in ranked order.
     */
    private reorder(posts: Post[], ids: string[]): Post[] {
        const byId = new Map(posts.map((post) => [post.id, post]));

        return ids
            .map((id) => byId.get(id))
            .filter((post): post is Post => post !== undefined);
    }
}
