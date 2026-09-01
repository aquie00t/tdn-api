import { Article } from "@core/domain/entities/article.entity";
import type { ArticleStatus } from "@core/domain/enums";
import type { PostCategory } from "@core/domain/enums/post-category-enum";
import type { IArticleRepository } from "@core/ports/repositories/article.repository";
import type { IFollowRepository } from "@core/ports/repositories/follow.repository";
import type { IUserRepository } from "@core/ports/repositories/user.repository";
import type { CachePort } from "@core/ports/services/cache.port";
import { UnauthorizedError } from "@core/errors";
import { normalizeTagFilter } from "../article-input";
import type { GetArticlesUseCaseInput } from "./get-articles-usecase.input";
import type { GetArticlesUseCaseOutput } from "./get-articles-usecase.output";

/** How long a rendered page of the list stays cached, in seconds. */
const CACHE_TTL_SECONDS = 60;

/** Default page size when the caller does not ask for one. */
const DEFAULT_LIMIT = 10;

/**
 * The exact shape written to the cache.
 *
 * Declared explicitly rather than spreading whatever the entity happened to
 * serialize to: a loose shape keeps stale fields alive across deploys, and the
 * reader silently accepts them.
 */
interface CachedArticle {
    id: string;
    slug: string;
    title: string;
    body: string;
    excerpt: string | null;
    coverImageKey: string | null;
    coverImageAlt: string | null;
    isSensitive: boolean;
    status: string;
    publishedAt: string | null;
    readingTimeMinutes: number;
    author: {
        id: string;
        username?: string;
        avatarUrl?: string;
        fullName?: string;
    };
    tags: string[];
    categories: string[];
    createdAt: string;
    updatedAt: string;
    likeCount: number;
    commentCount: number;
    isLiked: boolean;
    isBookmarked: boolean;
}

interface CachedPage {
    articles: CachedArticle[];
    total: number;
}

/**
 * Use case for the public, paginated article list.
 *
 * Only published articles ever reach this path, and the cache is only ever
 * touched here: an author reading their own drafts goes through
 * GetMyArticlesUseCase, which shares no cache key space with this one.
 */
export class GetArticlesUseCase {
    /**
     * Creates a new instance of GetArticlesUseCase.
     *
     * Parameter names are load-bearing: awilix runs in CLASSIC mode and
     * resolves each argument by its name, so they must match the container
     * registration keys exactly.
     *
     * @param articleRepository - Repository for reading articles
     * @param cacheService - Cache holding rendered pages of the list
     * @param userRepository - Used to resolve an author username to an id
     * @param followUserRepository - Used to resolve the followed-authors filter
     */
    constructor(
        private readonly articleRepository: IArticleRepository,
        private readonly cacheService: CachePort,
        private readonly userRepository: IUserRepository,
        private readonly followUserRepository: IFollowRepository,
    ) {}

    /**
     * Executes the list query.
     *
     * @param input - Pagination and filters
     * @returns The page of published articles and the total count
     *
     * @throws UnauthorizedError - When followedOnly is used without a viewer
     */
    async execute(
        input: GetArticlesUseCaseInput,
    ): Promise<GetArticlesUseCaseOutput> {
        const page = input.page ?? 1;
        const limit = input.limit ?? DEFAULT_LIMIT;
        const followedOnly = input.followedOnly ?? false;
        const tag = normalizeTagFilter(input.tag);

        if (followedOnly && !input.currentUserId) {
            throw new UnauthorizedError(
                "Authentication is required to use the followedOnly filter.",
            );
        }

        const cacheKey = this.buildCacheKey(
            input,
            page,
            limit,
            followedOnly,
            tag,
        );
        const cached = await this.cacheService.get(cacheKey);

        if (cached) {
            const parsed = JSON.parse(cached) as CachedPage;
            return {
                articles: parsed.articles.map((entry) => this.fromCache(entry)),
                total: parsed.total,
            };
        }

        let authorId: string | undefined;
        if (input.authorUsername) {
            const author = await this.userRepository.findByUsername(
                input.authorUsername,
            );

            // An unknown username is a filter that matches nothing, not an
            // error: it must not be distinguishable from an author with no
            // published articles.
            if (!author) return { articles: [], total: 0 };

            authorId = author.id;
        }

        const followingIds = followedOnly
            ? await this.followUserRepository.getFollowingIds(
                  input.currentUserId as string,
              )
            : undefined;

        const result = await this.articleRepository.findAll({
            page,
            limit,
            tag,
            authorId,
            categories: input.categories,
            followingIds,
            currentUserId: input.currentUserId,
        });

        await this.cacheService.set(
            cacheKey,
            JSON.stringify({
                articles: result.articles.map((article) =>
                    this.toCache(article),
                ),
                total: result.total,
            } satisfies CachedPage),
            CACHE_TTL_SECONDS,
        );

        return result;
    }

    /**
     * Builds the cache key for one page of the list.
     *
     * Every filter appears in the key, and absent values become a literal so
     * the key space stays flat and a single pattern delete can clear it.
     *
     * @param input - The request filters
     * @param page - Resolved page number
     * @param limit - Resolved page size
     * @param followedOnly - Resolved followed-authors flag
     * @param normalizedTag - The tag filter as the repository will see it
     * @returns The cache key
     */
    private buildCacheKey(
        input: GetArticlesUseCaseInput,
        page: number,
        limit: number,
        followedOnly: boolean,
        normalizedTag?: string,
    ): string {
        // The normalized tag, not the raw one: "NodeJS" and "nodejs" select the
        // same articles, so they must not occupy two cache entries.
        const tag = normalizedTag ?? "ALL";
        const author = input.authorUsername ?? "ALL";
        const categories =
            input.categories && input.categories.length > 0
                ? [...input.categories].sort().join(",")
                : "ALL";
        const viewer = input.currentUserId ?? "guest";

        return (
            "articles:list:page:" +
            page +
            ":limit:" +
            limit +
            ":tag:" +
            tag +
            ":author:" +
            author +
            ":categories:" +
            categories +
            ":followedOnly:" +
            followedOnly +
            ":user:" +
            viewer
        );
    }

    /**
     * Projects an article onto the cached shape.
     *
     * @param article - The article to cache
     * @returns The serializable projection
     */
    private toCache(article: Article): CachedArticle {
        return {
            id: article.id,
            slug: article.slug,
            title: article.title,
            body: article.body,
            excerpt: article.excerpt,
            coverImageKey: article.coverImageKey,
            coverImageAlt: article.coverImageAlt,
            // Carried through the cache like every other stored field. Dropping
            // it would serve a cover moderation judged borderline unblurred on
            // the one endpoint where most people meet it.
            isSensitive: article.isSensitive,
            status: article.status,
            publishedAt: article.publishedAt
                ? article.publishedAt.toISOString()
                : null,
            readingTimeMinutes: article.readingTimeMinutes,
            author: {
                id: article.author.id,
                username: article.author.username,
                avatarUrl: article.author.avatarUrl,
                fullName: article.author.fullName,
            },
            tags: article.tags,
            categories: article.categories,
            createdAt: article.createdAt.toISOString(),
            updatedAt: article.updatedAt.toISOString(),
            likeCount: article.likeCount,
            commentCount: article.commentCount,
            isLiked: article.isLiked,
            isBookmarked: article.isBookmarked,
        };
    }

    /**
     * Rebuilds an article from the cached shape, field by field.
     *
     * @param entry - The cached projection
     * @returns The reconstructed article
     */
    private fromCache(entry: CachedArticle): Article {
        return Article.with({
            id: entry.id,
            slug: entry.slug,
            title: entry.title,
            body: entry.body,
            excerpt: entry.excerpt,
            coverImageKey: entry.coverImageKey,
            coverImageAlt: entry.coverImageAlt,
            // Older cache entries predate the field; a missing one reads as
            // "not flagged", which matches how those articles were stored.
            isSensitive: entry.isSensitive ?? false,
            status: entry.status as ArticleStatus,
            publishedAt: entry.publishedAt ? new Date(entry.publishedAt) : null,
            readingTimeMinutes: entry.readingTimeMinutes,
            author: entry.author,
            tags: entry.tags,
            categories: entry.categories as PostCategory[],
            createdAt: new Date(entry.createdAt),
            updatedAt: new Date(entry.updatedAt),
            likeCount: entry.likeCount,
            commentCount: entry.commentCount,
            isLiked: entry.isLiked,
            isBookmarked: entry.isBookmarked,
        });
    }
}
