import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { IBlockRepository } from "@core/ports/repositories/block.repository";
import type { IProfileRepository } from "@core/ports/repositories/profile.repository";
import type { IUserInterestRepository } from "@core/ports/repositories/user-interest.repository";
import type { CachePort } from "@core/ports/services/cache.port";
import type { CryptoPort } from "@core/ports/services/crypto.port";
import type { SeenPostsPort } from "@core/ports/services/seen-posts.port";
import type { LoggerPort } from "@core/ports/services/logger.port";
import type { GetPostsInput } from "./get-posts-usecase.input";
import type { GetPostsOutput } from "./get-posts-usecase.output";
import type { Post } from "@core/domain/entities/post.entity";
import type { FeedCandidate } from "@core/domain/interfaces/feed-candidate.interface";
import { UnauthorizedError } from "@core/errors";
import { PostType } from "@core/domain/enums";
import {
    DEFAULT_LANGUAGE,
    normalizeLanguageTag,
    parseLanguagePreferenceHeader,
} from "@core/domain/constants/language.constants";
import {
    indexInterests,
    rankFeed,
    type FeedRankingWeights,
} from "./feed-ranking";
import { decodeFeedCursor, encodeFeedCursor } from "./feed-cursor";

/**
 * How long the pointer to a viewer's current ranked order lives.
 *
 * This is the "what should a fresh visit see" entry, so it is short: a new
 * post should reach the top of the feed quickly. Readers already scrolling are
 * unaffected by it expiring - they hold a cursor into a snapshot, which has
 * its own lifetime.
 */
const RANKED_POINTER_TTL_SECONDS = 5 * 60;

/**
 * How long a reader may keep scrolling one snapshot of the ranked order.
 *
 * Generous compared with the pointer, because this is the window in which
 * paging stays coherent. A reader who comes back after it lapses is served a
 * freshly built order from the same depth, which is the right outcome anyway -
 * an hour-old ranking is not worth preserving.
 */
const SCROLL_SNAPSHOT_TTL_SECONDS = 30 * 60;

/**
 * Bumped whenever a cached shape changes, so entries written by the previous
 * deploy are ignored rather than misread.
 */
const FEED_CACHE_VERSION = "v2";

/**
 * Bytes of randomness behind a scroll token.
 *
 * A token addresses one reader's snapshot, so it has to be unguessable rather
 * than merely unique: the ids in a `followedOnly` snapshot say something about
 * who that reader follows.
 */
const SCROLL_TOKEN_BYTES = 16;

/**
 * Floor on how many unseen candidates make a pool worth filtering down to.
 *
 * The actual threshold is this or the requested page size, whichever is
 * larger: filtering a pool down to fewer posts than the reader asked for turns
 * "you have seen these" into "here is a short page", which is the worse
 * outcome of the two. Below the threshold the filter is abandoned and the
 * whole pool is ranked, so a reader who has worked through everything recent
 * gets repeats rather than an empty feed.
 */
const MIN_UNSEEN_POOL = 10;

/**
 * One snapshot of the ranked order, as it is cached.
 */
interface RankedSnapshot {
    ids: string[];
    total: number;
}

/**
 * Where in a snapshot a request starts, and under which token.
 */
interface ScrollPosition {
    snapshot: RankedSnapshot;
    token: string;
    offset: number;
}

/**
 * Use case for retrieving the post feed.
 *
 * Builds a ranked feed rather than a chronological one: the candidate pool for
 * the viewer's filters is scored by {@link rankFeed} - language first, then
 * who they follow, engagement and freshness - and the resulting order is
 * snapshotted so a reader can page through it while the world keeps writing.
 */
export class GetPostsUseCase {
    /**
     * Creates a new instance of GetPostsUseCase.
     *
     * @param postRepository - Repository for reading posts and feed candidates
     * @param cacheService - Cache holding ranked orders and scroll snapshots
     * @param followUserRepository - Repository used to resolve who the viewer follows
     * @param blockRepository - Repository used to resolve who the viewer cannot see
     * @param profileRepository - Repository used to read the viewer's feed languages
     * @param userInterestRepository - Repository holding each viewer's interest profile
     * @param cryptoService - Source of the random tokens that address snapshots
     * @param seenPostsService - Record of what each reader has already been shown
     * @param logger - Service for logging operations
     * @param feedRankingWeights - Tuning weights for the ranker
     * @param feedCandidatePoolSize - Hard cap on the candidate pool
     * @param feedCandidateWindowDays - How far back candidates may be drawn from
     * @param random - Source of randomness for the ranker's exploration slots
     */
    constructor(
        private readonly postRepository: IPostRepository,
        private readonly cacheService: CachePort,
        private readonly followUserRepository: IFollowRepository,
        private readonly blockRepository: IBlockRepository,
        private readonly profileRepository: IProfileRepository,
        private readonly userInterestRepository: IUserInterestRepository,
        private readonly cryptoService: CryptoPort,
        private readonly seenPostsService: SeenPostsPort,
        private readonly logger: LoggerPort,
        private readonly feedRankingWeights: FeedRankingWeights,
        private readonly feedCandidatePoolSize: number,
        private readonly feedCandidateWindowDays: number,
        private readonly random: () => number = Math.random,
    ) {}

    /**
     * Retrieves one page of the feed.
     *
     * @param input - Pagination or cursor, filters, the viewer and their Accept-Language
     * @returns The page of posts, the total matching the filters, and the
     * cursor that continues from where this page ended
     *
     * @throws UnauthorizedError - When followedOnly is used without a viewer
     *
     * @remarks
     * Paging is by cursor. A cursor pins the reader to one snapshot of the
     * ranked order and records how deep into it they are, which is the only
     * way paging can stay coherent here: publishing a post invalidates the
     * ranked order, and on a network with a hundred-odd news bots that happens
     * constantly. Under page numbers the reader's page 3 would be computed
     * against an order they never saw page 2 of.
     *
     * Page numbers still work, for clients that have not moved over. They
     * behave as before - each request re-derives the order - so they carry the
     * shifting they always did; the response hands back a cursor either way.
     *
     * Only ids are cached; the page itself is hydrated fresh on every request.
     * Caching whole posts would freeze the viewer's own like and bookmark
     * state for the life of the entry, and reading ten rows by primary key is
     * cheap next to getting that wrong.
     *
     * Ranking covers a bounded window of recent posts. Paging past it falls
     * through to the chronological tail, which excludes everything the ranked
     * head already served so that no post is shown twice or skipped.
     */
    async execute(input: GetPostsInput): Promise<GetPostsOutput> {
        const limit = input.limit || 10;
        const followedOnly = input.followedOnly ?? false;

        if (followedOnly && !input.currentUserId) {
            throw new UnauthorizedError(
                "Authentication is required to use the followedOnly filter.",
            );
        }

        // Resolved once per request and threaded through every path below.
        // A guest has nobody hidden from them, so the query is skipped.
        const excludeAuthorIds = input.currentUserId
            ? await this.blockRepository.getInvisibleUserIds(
                  input.currentUserId,
              )
            : [];

        if (!this.isRankable(input.type)) {
            return this.chronologicalPage(
                input,
                input.page || 1,
                limit,
                excludeAuthorIds,
            );
        }

        const { snapshot, token, offset } = await this.resolveScrollPosition(
            input,
            limit,
            followedOnly,
            excludeAuthorIds,
        );

        if (offset >= snapshot.ids.length) {
            return this.chronologicalTail(
                input,
                offset - snapshot.ids.length,
                limit,
                snapshot,
                token,
                offset,
                excludeAuthorIds,
            );
        }

        const pageIds = snapshot.ids.slice(offset, offset + limit);
        // Applied again at hydration, not only when the order was built: a
        // snapshot outlives a block by up to its own lifetime, and filtering
        // here is what lets a stale one heal instead of having to be
        // invalidated. The page comes back short, and the top-up below - which
        // exists for the same shape of problem - fills it.
        const hydrated = await this.postRepository.findByIds(
            pageIds,
            input.currentUserId,
            excludeAuthorIds,
        );
        const ranked = this.reorder(hydrated, pageIds);

        // The ranked window is narrow - a bounded pool of recent posts - and
        // on a quiet feed it can hold fewer posts than the reader asked for.
        // Ending the page there would tell them the feed is over while
        // hundreds of older posts sit behind it, which is exactly what
        // happened to Turkish readers of the community feed: two matching
        // posts, then "no more posts".
        const topUp =
            pageIds.length < limit
                ? await this.tailPosts(
                      input,
                      0,
                      limit - pageIds.length,
                      snapshot,
                      excludeAuthorIds,
                  )
                : [];

        const posts = [...ranked, ...topUp];

        await this.recordSeen(
            input.currentUserId,
            posts.map((post) => post.id),
        );

        return {
            posts,
            total: snapshot.total,
            // Advanced by ids consumed rather than posts returned, so a post
            // deleted between ranking and hydration shortens this page instead
            // of leaving a gap that is served again forever. The top-up counts
            // too: the tail keeps counting in the snapshot's coordinates.
            nextCursor:
                pageIds.length < limit && topUp.length < limit - pageIds.length
                    ? // The ranked window ran out and the tail could not fill
                      // the rest, so there is genuinely nothing behind this.
                      null
                    : encodeFeedCursor({
                          token,
                          offset: offset + pageIds.length + topUp.length,
                      }),
        };
    }

    /**
     * Works out which snapshot this request reads and where in it to start.
     *
     * A cursor is followed when it still resolves. When it does not - the
     * snapshot lapsed, or the cursor was malformed - the order is rebuilt and
     * the reader is placed at the same depth in the new one under a fresh
     * token. That trades a little duplication at the seam for continuing to
     * serve a feed, which beats failing the request over an expired cache
     * entry.
     *
     * @param input - The feed request.
     * @param limit - Page size, used to translate a page number into a depth.
     * @param followedOnly - Whether the pool is restricted to followed accounts.
     * @param excludeAuthorIds - Authors invisible to the viewer.
     * @returns The snapshot, its token, and the offset to read from.
     */
    private async resolveScrollPosition(
        input: GetPostsInput,
        limit: number,
        followedOnly: boolean,
        excludeAuthorIds: string[],
    ): Promise<ScrollPosition> {
        const cursor = input.cursor ? decodeFeedCursor(input.cursor) : null;

        if (cursor) {
            const snapshot = await this.readSnapshot(cursor.token);
            if (snapshot) {
                return { snapshot, token: cursor.token, offset: cursor.offset };
            }
        }

        // Without a usable cursor the request starts a scroll, so it reads the
        // current order rather than a pinned one. A stale cursor keeps its
        // depth; a page number is translated into one.
        const { snapshot, token } = await this.currentRankedOrder(
            input,
            limit,
            followedOnly,
            excludeAuthorIds,
        );

        return {
            snapshot,
            token,
            offset: cursor ? cursor.offset : ((input.page || 1) - 1) * limit,
        };
    }

    /**
     * Returns the order a fresh visit should see, building it when cold.
     *
     * The order itself is stored under a random token and the per-viewer key
     * holds only that token. Two levels, because they expire for different
     * reasons: the pointer is invalidated whenever someone publishes, so fresh
     * visits pick up new posts, while the snapshot it pointed at stays
     * readable for everyone still scrolling it.
     *
     * @param input - The feed request.
     * @param limit - The page size the reader asked for.
     * @param followedOnly - Whether the pool is restricted to followed accounts.
     * @param excludeAuthorIds - Authors invisible to the viewer.
     * @returns The snapshot and the token addressing it.
     */
    private async currentRankedOrder(
        input: GetPostsInput,
        limit: number,
        followedOnly: boolean,
        excludeAuthorIds: string[],
    ): Promise<{ snapshot: RankedSnapshot; token: string }> {
        const languages = await this.resolveViewerLanguages(input);
        const pointerKey = this.rankedPointerKey(
            input,
            languages,
            followedOnly,
        );

        const pointer = await this.cacheService.get(pointerKey);
        if (pointer) {
            const snapshot = await this.readSnapshot(pointer);
            if (snapshot) return { snapshot, token: pointer };
        }

        const snapshot = await this.buildRankedOrder(
            input,
            languages,
            limit,
            followedOnly,
            excludeAuthorIds,
        );
        const token = this.cryptoService.generateRandomHex(SCROLL_TOKEN_BYTES);

        await this.cacheService.set(
            this.snapshotKey(token),
            JSON.stringify(snapshot),
            SCROLL_SNAPSHOT_TTL_SECONDS,
        );
        await this.cacheService.set(
            pointerKey,
            token,
            RANKED_POINTER_TTL_SECONDS,
        );

        return { snapshot, token };
    }

    /**
     * Reads a snapshot back, treating anything unreadable as absent.
     *
     * @param token - The token addressing the snapshot.
     * @returns The snapshot, or null when it has lapsed or cannot be parsed.
     */
    private async readSnapshot(token: string): Promise<RankedSnapshot | null> {
        const raw = await this.cacheService.get(this.snapshotKey(token));
        if (!raw) return null;

        try {
            return JSON.parse(raw) as RankedSnapshot;
        } catch {
            // An entry written by an older encoding is worth no more than a
            // missing one, and is not worth failing the feed over.
            return null;
        }
    }

    /**
     * Scores the candidate pool into one ranked order.
     *
     * @param input - The feed request.
     * @param languages - The viewer's languages.
     * @param limit - The page size the reader asked for.
     * @param followedOnly - Whether the pool is restricted to followed accounts.
     * @returns The ranked ids and the total matching the filters.
     */
    private async buildRankedOrder(
        input: GetPostsInput,
        languages: string[],
        limit: number,
        followedOnly: boolean,
        excludeAuthorIds: string[],
    ): Promise<RankedSnapshot> {
        // A signed-in viewer's follow graph and interest profile are both
        // reads that only the ranker needs, so they go out together rather
        // than one after the other.
        const [followingIds, interests] = input.currentUserId
            ? await Promise.all([
                  this.followUserRepository.getFollowingIds(
                      input.currentUserId,
                  ),
                  this.userInterestRepository.findByUserId(input.currentUserId),
              ])
            : [[], []];

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
                excludeAuthorIds,
                since,
                limit: this.feedCandidatePoolSize,
            }),
            // The count carries the same exclusion as the pool it describes.
            // A total that included blocked authors would promise pages the
            // reader can never reach.
            this.postRepository.countAll({
                type: input.type,
                tag: input.tag,
                categories: input.categories,
                followingIds: scopedFollowingIds,
                excludeAuthorIds,
            }),
        ]);

        const ranked = rankFeed(
            await this.dropSeen(candidates, limit, input.currentUserId),
            {
                languages,
                followingIds: new Set(followingIds),
                interests: indexInterests(interests),
                now: new Date(),
                random: this.random,
            },
            this.feedRankingWeights,
        );

        return { ids: ranked.map((candidate) => candidate.id), total };
    }

    /**
     * Records that a page was shown, before the response goes out.
     *
     * Awaited rather than fired and forgotten. The write is one pipelined
     * Redis round trip next to a hydration query that already cost more, and
     * not waiting for it loses the race this whole record exists to win: a
     * reader scrolling fast issues the next request while the previous write
     * is still in flight, and the order rebuilt for them then repeats exactly
     * the page they just read.
     *
     * The port promises never to throw and the shipped adapter keeps that
     * promise, but the failure it guards against - a whole feed 500ing because
     * Redis blinked - is bad enough not to rest on a future implementation
     * having read the contract. Caught here too.
     *
     * @param currentUserId - The viewer, when there is one.
     * @param pageIds - The ids that were served.
     */
    private async recordSeen(
        currentUserId: string | undefined,
        pageIds: string[],
    ): Promise<void> {
        if (!currentUserId || pageIds.length === 0) return;

        try {
            await this.seenPostsService.markSeen(currentUserId, pageIds);
        } catch (err: unknown) {
            this.logger.error(
                { err, userId: currentUserId },
                "Failed to record which posts a reader was shown",
            );
        }
    }

    /**
     * Removes posts the viewer has already been shown.
     *
     * Done here rather than when a page is served, so pages stay full:
     * filtering at serve time would hand a reader a page of four when six of
     * the ten had been seen.
     *
     * The filter is abandoned when it would leave too little to rank - see
     * {@link MIN_UNSEEN_POOL}. A reader who has exhausted the recent window
     * should get repeats rather than an empty or stubby feed, and on a quiet
     * day, or behind a narrow tag filter, the pool can be that small to begin
     * with.
     *
     * @param candidates - The pool to narrow.
     * @param limit - The page size the reader asked for.
     * @param currentUserId - The viewer, when there is one.
     * @returns The pool, minus what they have seen.
     */
    private async dropSeen(
        candidates: FeedCandidate[],
        limit: number,
        currentUserId?: string,
    ): Promise<FeedCandidate[]> {
        // A signed-out visitor has no stable identity to remember anything
        // against, so there is nothing to filter and nothing to ask.
        if (!currentUserId || candidates.length === 0) return candidates;

        const unseenIds = new Set(
            await this.seenPostsService.filterUnseen(
                currentUserId,
                candidates.map((candidate) => candidate.id),
            ),
        );

        if (unseenIds.size < Math.max(MIN_UNSEEN_POOL, limit)) {
            return candidates;
        }

        return candidates.filter((candidate) => unseenIds.has(candidate.id));
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
     * The key holding the token of a viewer's current ranked order.
     *
     * The languages are part of the key, not just the viewer: two anonymous
     * visitors with different `Accept-Language` headers must not share an
     * order, and the same user changing their preference must not keep the old
     * one until it expires.
     *
     * Kept under the `posts:feed:` prefix so publishing a post clears it.
     *
     * @param input - The feed request.
     * @param languages - The viewer's resolved languages.
     * @param followedOnly - Whether the pool is restricted to followed accounts.
     * @returns The pointer key.
     */
    private rankedPointerKey(
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
            FEED_CACHE_VERSION,
            `user:${input.currentUserId || "guest"}`,
            `langs:${languages.join(",")}`,
            `type:${input.type || "ALL"}`,
            `tag:${input.tag ?? "ALL"}`,
            `categories:${categories}`,
            `followedOnly:${followedOnly}`,
        ].join(":");
    }

    /**
     * The key one scroll snapshot is stored under.
     *
     * Deliberately outside the `posts:feed:` prefix: publishing a post must
     * retire the pointer so the next fresh visit re-ranks, but it must not
     * pull the order out from under everyone mid-scroll, which is the whole
     * reason snapshots exist.
     *
     * @param token - The token addressing the snapshot.
     * @returns The snapshot key.
     */
    private snapshotKey(token: string): string {
        return `feed:scroll:${FEED_CACHE_VERSION}:${token}`;
    }

    /**
     * Reads posts from behind the ranked window, newest first.
     *
     * Shared by the two ways a reader reaches past the ranking: paging clean
     * off the end of the snapshot, and a ranked page too short to fill the
     * limit on its own. Both must skip everything the snapshot holds, or the
     * reader is served a post they have already been given.
     *
     * @param input - The feed request.
     * @param skip - How many tail rows have already been served this scroll.
     * @param limit - How many rows to read.
     * @param snapshot - The snapshot whose ids the tail must not repeat.
     * @param excludeAuthorIds - Authors invisible to the viewer.
     * @returns The posts, at most `limit` of them.
     */
    private async tailPosts(
        input: GetPostsInput,
        skip: number,
        limit: number,
        snapshot: RankedSnapshot,
        excludeAuthorIds: string[],
    ): Promise<Post[]> {
        if (limit <= 0) return [];

        const { posts } = await this.postRepository.findAll({
            page: 1,
            skip,
            limit,
            type: input.type,
            currentUserId: input.currentUserId,
            tag: input.tag,
            categories: input.categories,
            excludeIds: snapshot.ids,
            excludeAuthorIds,
            ...(input.followedOnly && input.currentUserId
                ? {
                      followingIds:
                          await this.followUserRepository.getFollowingIds(
                              input.currentUserId,
                          ),
                  }
                : {}),
        });

        return posts;
    }

    /**
     * Serves a page from beyond the ranked window.
     *
     * @param input - The feed request.
     * @param skip - How far past the ranked head the page starts.
     * @param limit - Page size.
     * @param snapshot - The snapshot, whose ids this page must not repeat.
     * @param token - The token the returned cursor keeps pointing at.
     * @param offset - Where this page started, in snapshot coordinates.
     * @param excludeAuthorIds - Authors invisible to the viewer.
     * @returns The page of posts, the unchanged total, and the next cursor.
     */
    private async chronologicalTail(
        input: GetPostsInput,
        skip: number,
        limit: number,
        snapshot: RankedSnapshot,
        token: string,
        offset: number,
        excludeAuthorIds: string[],
    ): Promise<GetPostsOutput> {
        const posts = await this.tailPosts(
            input,
            skip,
            limit,
            snapshot,
            excludeAuthorIds,
        );

        await this.recordSeen(
            input.currentUserId,
            posts.map((post) => post.id),
        );

        return {
            posts,
            total: snapshot.total,
            // A short read is the end of the feed: the query asked for `limit`
            // rows and the database had fewer left. A full one keeps counting
            // in the snapshot's coordinates, so the next cursor lands one page
            // further into the tail rather than back at its start.
            nextCursor:
                posts.length === limit
                    ? encodeFeedCursor({
                          token,
                          offset: offset + posts.length,
                      })
                    : null,
        };
    }

    /**
     * Serves a feed that is not ranked at all, newest first.
     *
     * @param input - The feed request.
     * @param page - The requested page.
     * @param limit - Page size.
     * @param excludeAuthorIds - Authors invisible to the viewer.
     * @returns The page of posts and the total matching the filters.
     */
    private async chronologicalPage(
        input: GetPostsInput,
        page: number,
        limit: number,
        excludeAuthorIds: string[],
    ): Promise<GetPostsOutput> {
        const { posts, total } = await this.postRepository.findAll({
            page,
            limit,
            type: input.type,
            currentUserId: input.currentUserId,
            tag: input.tag,
            categories: input.categories,
            excludeAuthorIds,
            ...(input.followedOnly && input.currentUserId
                ? {
                      followingIds:
                          await this.followUserRepository.getFollowingIds(
                              input.currentUserId,
                          ),
                  }
                : {}),
        });

        // An unranked feed has no snapshot to pin, and needs none: it is
        // chronological, so page numbers describe it exactly.
        return { posts, total, nextCursor: null };
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
