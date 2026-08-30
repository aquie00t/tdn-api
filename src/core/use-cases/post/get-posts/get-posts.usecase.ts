import type { IPostRepository } from "@core/ports/repositories/post.repository";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { CachePort } from "@core/ports/services/cache.port";
import type { GetPostsInput } from "./get-posts-usecase.input";
import type { GetPostsOutput } from "./get-posts-usecase.output";
import { Post } from "@core/domain/entities/post.entity";
import { UnauthorizedError } from "@core/errors";
import { PostType } from "@core/domain/enums";
import type { QuotedPostSnapshot } from "@core/domain/interfaces/quoted-post.interface";

interface CachedPostData {
    id: string;
    createdAt: string;
    updatedAt: string;
    props?: Record<string, unknown>;
    [key: string]: unknown;
}

interface CachedFeedData {
    posts: CachedPostData[];
    total: number;
}

/**
 * Rebuilds the quoted post card that came back from the cache.
 *
 * `JSON.parse` leaves every date a string, and the caller revives only the
 * top-level `createdAt` / `updatedAt`. Without this the same request would
 * answer with a `Date` on a cache miss and a string for the next 60 seconds,
 * so the serialised shape of the response would flip on its own.
 *
 * @param raw - The `quotedPost` value as it was parsed out of the cache
 * @returns The card with a real `Date`, or undefined when nothing is quoted
 */
function hydrateQuotedPost(raw: unknown): QuotedPostSnapshot | undefined {
    if (!raw) return undefined;

    const quoted = raw as Omit<QuotedPostSnapshot, "createdAt"> & {
        createdAt: string;
    };

    return { ...quoted, createdAt: new Date(quoted.createdAt) };
}

function shufflePosts(posts: Post[]): Post[] {
    const shuffled = [...posts];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

export class GetPostsUseCase {
    constructor(
        private readonly postRepository: IPostRepository,
        private readonly cacheService: CachePort,
        private readonly followRepository: IFollowRepository,
    ) {}

    async execute(input: GetPostsInput): Promise<GetPostsOutput> {
        const page = input.page || 1;
        const limit = input.limit || 10;
        const typeStr = input.type || "ALL";
        const tagStr = input.tag ?? "ALL";
        const followedOnly = input.followedOnly ?? false;
        const categoriesStr =
            input.categories && input.categories.length > 0
                ? input.categories.join(",")
                : "ALL";

        if (followedOnly && !input.currentUserId) {
            throw new UnauthorizedError(
                "Authentication is required to use the followedOnly filter.",
            );
        }

        const cacheKey = `posts:feed:page:${page}:limit:${limit}:type:${typeStr}:tag:${tagStr}:categories:${categoriesStr}:followedOnly:${followedOnly}:user:${input.currentUserId || "guest"}`;

        const cachedData = await this.cacheService.get(cacheKey);

        if (cachedData) {
            const parsed = JSON.parse(cachedData) as CachedFeedData;

            const hydratedPosts = parsed.posts.map((p) => {
                const data = p.props || p;

                return Post.with({
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ...(data as any),
                    id: p.id || (data.id as string),
                    createdAt: new Date(data.createdAt as string),
                    updatedAt: new Date(data.updatedAt as string),
                    quotedPost: hydrateQuotedPost(data.quotedPost),
                });
            });

            return {
                posts: this.orderForResponse(hydratedPosts, input.type),
                total: parsed.total,
            };
        }

        const { posts, total } = await this.postRepository.findAll({
            page,
            limit,
            type: input.type,
            currentUserId: input.currentUserId,
            tag: input.tag,
            categories: input.categories,
            ...(followedOnly && input.currentUserId
                ? {
                      followingIds: await this.followRepository.getFollowingIds(
                          input.currentUserId,
                      ),
                  }
                : {}),
        });

        const response: GetPostsOutput = {
            posts,
            total,
        };

        await this.cacheService.set(cacheKey, JSON.stringify(response), 60);

        return {
            posts: this.orderForResponse(posts, input.type),
            total,
        };
    }

    /**
     * Applies the feed's ordering policy to a page of posts.
     *
     * Only the community feed is shuffled, to keep it from looking static
     * between visits. Every other feed is chronological, because a release or
     * a job posting is only useful in the order it happened.
     *
     * Shared by both the cached and uncached paths on purpose: when the cache
     * hit shuffled unconditionally, the same request returned chronological
     * results on a miss and randomised ones for the next 60 seconds.
     *
     * @param posts - The page of posts to order
     * @param type - The post type the caller filtered on, if any
     * @returns The posts in the order they should be returned
     */
    private orderForResponse(posts: Post[], type?: PostType): Post[] {
        return type === PostType.COMMUNITY ? shufflePosts(posts) : posts;
    }
}
