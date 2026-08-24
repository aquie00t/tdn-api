import type { Article } from "@core/domain/entities/article.entity";
import type { ArticleStatus } from "@core/domain/enums";
import type { PostCategory } from "@core/domain/enums/post-category-enum";

/**
 * Parameters for the public, paginated article list.
 *
 * There is deliberately no `status` field: every query built from these
 * parameters is pinned to published articles inside the repository, so a
 * caller cannot widen the visibility of a public listing by mistake.
 */
export interface GetArticlesParams {
    page: number;
    limit: number;
    tag?: string;
    authorId?: string;
    categories?: PostCategory[];
    followingIds?: string[];
    savedByUserId?: string;
    currentUserId?: string;
}

/**
 * Parameters for an author reading their own articles, drafts included.
 *
 * `authorId` must always come from the authenticated principal, never from a
 * path or query parameter — it is the only way unpublished rows leave the
 * repository.
 */
export interface GetAuthorArticlesParams {
    authorId: string;
    page: number;
    limit: number;
    status?: ArticleStatus;
}

/**
 * Repository interface for managing Article entities.
 *
 * Following Clean Architecture principles, this interface defines the contract
 * for persisting and retrieving Article domain entities without exposing
 * Prisma types or DTOs.
 */
export interface IArticleRepository {
    /**
     * Persists a new article along with its tags.
     *
     * @param article - The Article entity to store
     * @returns The stored article with its relations loaded
     */
    create(article: Article): Promise<Article>;

    /**
     * Persists an edit to an existing article.
     *
     * @param article - The Article entity carrying the updated state
     * @returns The stored article with its relations loaded
     */
    update(article: Article): Promise<Article>;

    /**
     * Retrieves a paginated list of published articles.
     *
     * @param params - Pagination and filtering parameters
     * @returns The matching articles and the total row count
     */
    findAll(
        params: GetArticlesParams,
    ): Promise<{ articles: Article[]; total: number }>;

    /**
     * Retrieves the articles written by one author, drafts included.
     *
     * @param params - The author, pagination and an optional status filter
     * @returns The matching articles and the total row count
     */
    findByAuthorId(
        params: GetAuthorArticlesParams,
    ): Promise<{ articles: Article[]; total: number }>;

    /**
     * Retrieves an article by its slug regardless of status.
     *
     * Visibility is intentionally not applied here: the caller decides, so that
     * an author can read back their own draft. Callers must run the result
     * through `Article.isVisibleTo` before returning it.
     *
     * @param slug - The article slug
     * @param currentUserId - Viewer used to resolve like and bookmark flags
     * @returns The article, or null when no row matches
     */
    findBySlug(slug: string, currentUserId?: string): Promise<Article | null>;

    /**
     * Retrieves an article by its identifier regardless of status.
     *
     * @param id - The article identifier
     * @param currentUserId - Viewer used to resolve like and bookmark flags
     * @returns The article, or null when no row matches
     */
    findById(id: string, currentUserId?: string): Promise<Article | null>;

    /**
     * Deletes an article. Likes, bookmarks and tag links cascade in the schema.
     *
     * @param id - The identifier of the article to delete
     */
    delete(id: string): Promise<void>;
}
